import { sql, relations } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, boolean, integer, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const userRoleEnum = pgEnum("user_role", ["admin", "team_member"]);
export const messageDirectionEnum = pgEnum("message_direction", ["inbound", "outbound"]);
export const messageStatusEnum = pgEnum("message_status", ["pending", "sent", "delivered", "read", "failed"]);
export const smsProviderEnum = pgEnum("sms_provider", ["signalwire", "twilio", "telnyx"]);

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  email: text("email").notNull().unique(),
  fullName: text("full_name").notNull(),
  role: userRoleEnum("role").notNull().default("team_member"),
  avatar: text("avatar"),
  theme: text("theme").default("default"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  createdBy: varchar("created_by"),
});

export const usersRelations = relations(users, ({ many }) => ({
  conversations: many(conversations),
  messages: many(messages),
}));

// SMS Gateway integrations - each admin can connect their own gateway
export const smsGateways = pgTable("sms_gateways", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  adminId: varchar("admin_id").notNull().references(() => users.id),
  provider: smsProviderEnum("provider").notNull(),
  name: text("name").notNull(),
  isActive: boolean("is_active").notNull().default(false),
  credentials: text("credentials").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const smsGatewaysRelations = relations(smsGateways, ({ one }) => ({
  admin: one(users, {
    fields: [smsGateways.adminId],
    references: [users.id],
  }),
}));

export const phoneNumbers = pgTable("phone_numbers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  number: text("number").notNull().unique(),
  friendlyName: text("friendly_name"),
  providerId: text("provider_id"),
  provider: smsProviderEnum("provider"),
  gatewayId: varchar("gateway_id").references(() => smsGateways.id),
  adminId: varchar("admin_id").references(() => users.id),
  assignedTo: varchar("assigned_to").references(() => users.id),
  capabilities: text("capabilities").array(),
  isActive: boolean("is_active").notNull().default(true),
  purchasedAt: timestamp("purchased_at").notNull().defaultNow(),
  monthlyRate: text("monthly_rate"),
});

export const phoneNumbersRelations = relations(phoneNumbers, ({ many }) => ({
  conversations: many(conversations),
}));

export const conversations = pgTable("conversations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  contactNumber: text("contact_number").notNull(),
  contactName: text("contact_name"),
  phoneNumberId: varchar("phone_number_id").references(() => phoneNumbers.id),
  assignedUserId: varchar("assigned_user_id").references(() => users.id),
  category: text("category").notNull().default("general"),
  lastMessageAt: timestamp("last_message_at"),
  lastMessagePreview: text("last_message_preview"),
  unreadCount: integer("unread_count").notNull().default(0),
  isPinned: boolean("is_pinned").notNull().default(false),
  isArchived: boolean("is_archived").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const conversationsRelations = relations(conversations, ({ one, many }) => ({
  phoneNumber: one(phoneNumbers, {
    fields: [conversations.phoneNumberId],
    references: [phoneNumbers.id],
  }),
  assignedUser: one(users, {
    fields: [conversations.assignedUserId],
    references: [users.id],
  }),
  messages: many(messages),
}));

export const messages = pgTable("messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  conversationId: varchar("conversation_id").notNull().references(() => conversations.id),
  senderId: varchar("sender_id").references(() => users.id),
  content: text("content").notNull(),
  direction: messageDirectionEnum("direction").notNull(),
  status: messageStatusEnum("status").notNull().default("pending"),
  signalwireMessageId: text("signalwire_message_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const messagesRelations = relations(messages, ({ one }) => ({
  conversation: one(conversations, {
    fields: [messages.conversationId],
    references: [conversations.id],
  }),
  sender: one(users, {
    fields: [messages.senderId],
    references: [users.id],
  }),
}));

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
});

export const loginSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});

export const signupSchema = z.object({
  username: z.string().min(3, "Username must be at least 3 characters"),
  email: z.string().email("Invalid email address"),
  fullName: z.string().min(2, "Full name is required"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

export const createTeamMemberSchema = z.object({
  username: z.string().min(3, "Username must be at least 3 characters"),
  email: z.string().email("Invalid email address"),
  fullName: z.string().min(2, "Full name is required"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

export const insertPhoneNumberSchema = createInsertSchema(phoneNumbers).omit({
  id: true,
  purchasedAt: true,
});

export const insertConversationSchema = createInsertSchema(conversations).omit({
  id: true,
  createdAt: true,
});

export const insertMessageSchema = createInsertSchema(messages).omit({
  id: true,
  createdAt: true,
});

export const sendMessageSchema = z.object({
  conversationId: z.string(),
  content: z.string().min(1, "Message cannot be empty"),
});

export const insertSmsGatewaySchema = createInsertSchema(smsGateways).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const connectGatewaySchema = z.object({
  provider: z.enum(["signalwire", "twilio", "telnyx"]),
  name: z.string().min(1, "Name is required"),
  credentials: z.record(z.string()),
});

export const updateProfileSchema = z.object({
  fullName: z.string().min(2, "Full name must be at least 2 characters"),
  email: z.string().email("Invalid email address"),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z.string().min(6, "New password must be at least 6 characters"),
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type LoginInput = z.infer<typeof loginSchema>;
export type SignupInput = z.infer<typeof signupSchema>;
export type CreateTeamMemberInput = z.infer<typeof createTeamMemberSchema>;

export type InsertPhoneNumber = z.infer<typeof insertPhoneNumberSchema>;
export type PhoneNumber = typeof phoneNumbers.$inferSelect;

export type InsertConversation = z.infer<typeof insertConversationSchema>;
export type Conversation = typeof conversations.$inferSelect;

export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type Message = typeof messages.$inferSelect;
export type SendMessageInput = z.infer<typeof sendMessageSchema>;

export type InsertSmsGateway = z.infer<typeof insertSmsGatewaySchema>;
export type SmsGateway = typeof smsGateways.$inferSelect;
export type ConnectGatewayInput = z.infer<typeof connectGatewaySchema>;
export type SmsProvider = "signalwire" | "twilio" | "telnyx";
