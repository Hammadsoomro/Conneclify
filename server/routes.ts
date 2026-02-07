import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import MemoryStore from "memorystore";
import { Pool } from "pg";
import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import bcrypt from "bcrypt";
import crypto from "crypto";
import { storage } from "./storage";
import { loginSchema, signupSchema, createTeamMemberSchema, sendMessageSchema, connectGatewaySchema, updateProfileSchema, changePasswordSchema, type SmsProvider } from "@shared/schema";
import { z } from "zod";
import { createSmsProvider, NoGatewayProvider, type ISmsProvider } from "./sms-providers";
import { encryptCredentials } from "./crypto";

function formatToE164(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  
  if (phone.startsWith("+")) {
    return "+" + digits;
  }
  
  if (digits.length === 10) {
    return "+1" + digits;
  }
  
  if (digits.length === 11 && digits.startsWith("1")) {
    return "+" + digits;
  }
  
  return "+" + digits;
}

interface ProviderContext {
  provider: ISmsProvider;
  adminId: string | null;
  gateway: Awaited<ReturnType<typeof storage.getActiveSmsGateway>>;
}

async function getProviderContext(userId: string): Promise<ProviderContext> {
  const user = await storage.getUser(userId);
  if (!user) {
    return { provider: new NoGatewayProvider(), adminId: null, gateway: undefined };
  }
  
  const adminId = user.role === "admin" ? user.id : user.createdBy;
  if (!adminId) {
    return { provider: new NoGatewayProvider(), adminId: null, gateway: undefined };
  }
  
  const gateway = await storage.getActiveSmsGateway(adminId);
  if (!gateway) {
    return { provider: new NoGatewayProvider(), adminId, gateway: undefined };
  }
  
  return { 
    provider: createSmsProvider(gateway), 
    adminId, 
    gateway 
  };
}

async function getProviderForUser(userId: string): Promise<ISmsProvider> {
  const { provider } = await getProviderContext(userId);
  return provider;
}

declare module "express-session" {
  interface SessionData {
    passport: { user: string };
  }
}

declare global {
  namespace Express {
    interface User {
      id: string;
      username: string;
      email: string;
      fullName: string;
      role: "admin" | "team_member";
      isActive: boolean;
    }
  }
}

const clients = new Map<string, Set<WebSocket>>();
const userClients = new Map<string, Set<WebSocket>>();

function broadcast(wsClients: Set<WebSocket> | undefined, data: any) {
  if (!wsClients) return;
  const message = JSON.stringify(data);
  wsClients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(message);
      } catch (err) {
        console.error("WebSocket send failed:", err);
      }
    }
  });
}

function broadcastToConversation(conversationId: string, data: any) {
  broadcast(clients.get(conversationId), data);
}

function broadcastToUser(userId: string, data: any) {
  broadcast(userClients.get(userId), data);
}

function broadcastToAdmin(adminId: string, data: any) {
  broadcast(userClients.get(adminId), data);
}

// Webhook signature verification functions
function verifyTwilioSignature(
  requestUrl: string,
  body: string,
  signature: string,
  authToken: string
): boolean {
  try {
    const hash = crypto
      .createHmac("sha1", authToken)
      .update(requestUrl + body)
      .digest("base64");
    return hash === signature;
  } catch (err) {
    console.error("Twilio signature verification error:", err);
    return false;
  }
}

function verifySignalWireSignature(
  body: string,
  signature: string,
  token: string
): boolean {
  try {
    const hash = crypto
      .createHmac("sha256", token)
      .update(body)
      .digest("hex");
    return hash === signature;
  } catch (err) {
    console.error("SignalWire signature verification error:", err);
    return false;
  }
}

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {
  const isProduction = process.env.NODE_ENV === "production";

  const sessionSecret = process.env.SESSION_SECRET;
  if (!sessionSecret && isProduction) {
    throw new Error("SESSION_SECRET environment variable is required in production");
  }

  // Use in-memory store for development, PostgreSQL for production
  let sessionStore: any;
  let pool: Pool | null = null;

  if (isProduction && process.env.DATABASE_URL) {
    const PgSession = connectPgSimple(session);
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
    });

    sessionStore = new PgSession({
      pool,
      tableName: "user_sessions",
      createTableIfMissing: true,
    });
  } else {
    // Use memory store for development
    const MemStoreClass = MemoryStore(session);
    sessionStore = new MemStoreClass();
  }

  // Trust proxy in production for secure cookies
  if (isProduction) {
    app.set("trust proxy", 1);
  }

  const sessionMiddleware = session({
    store: sessionStore,
    secret: sessionSecret || "conneclify-dev-secret-key-2024",
    resave: false,
    saveUninitialized: true,
    proxy: isProduction,
    cookie: {
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000,
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    }

  });
  
  app.use(sessionMiddleware);

  app.use(passport.initialize());
  app.use(passport.session());

  // Mock users for development (when database is not available)
  const mockUsers: Record<string, { password: string; user: any }> = {
    admin: {
      password: "admin123",
      user: {
        id: "mock-admin-1",
        username: "admin",
        email: "admin@conneclify.com",
        fullName: "John Administrator",
        role: "admin",
        isActive: true,
      }
    },
    sarah: {
      password: "team123",
      user: {
        id: "mock-team-1",
        username: "sarah.wilson",
        email: "sarah@conneclify.com",
        fullName: "Sarah Wilson",
        role: "team_member",
        isActive: true,
      }
    }
  };

  passport.use(
    new LocalStrategy(async (username, password, done) => {
      try {
        const user = await storage.getUserByUsername(username);
        if (!user) {
          return done(null, false, { message: "Invalid username or password" });
        }
        if (!user.isActive) {
          return done(null, false, { message: "Account is inactive" });
        }
        const isValid = await bcrypt.compare(password, user.password);
        if (!isValid) {
          return done(null, false, { message: "Invalid username or password" });
        }
        return done(null, {
          id: user.id,
          username: user.username,
          email: user.email,
          fullName: user.fullName,
          role: user.role,
          isActive: user.isActive,
        });
      } catch (err) {
        // Fallback to mock users in development when database is unavailable
        if (process.env.NODE_ENV !== "production") {
          const mockUser = mockUsers[username];
          if (mockUser && password === mockUser.password) {
            return done(null, mockUser.user);
          }
        }
        console.error("Login auth error:", err);
        return done(null, false, { message: "Authentication failed" });
      }
    })
  );

  passport.serializeUser((user: Express.User, done) => {
    done(null, user.id); // ✅ correct
  });

  passport.deserializeUser(async (id: string, done) => {
    try {
      const user = await storage.getUser(id);
      if (user) {
        done(null, user);
      } else {
        done(null, false);
      }
    } catch (err) {
      done(err);
    }
  });

  const requireAuth = (req: Request, res: Response, next: NextFunction) => {
    console.log("Auth check:", {
      isAuthenticated: req.isAuthenticated(),
      sessionID: req.sessionID,
      userId: req.user?.id,
      hasUser: !!req.user,
    });
    if (req.isAuthenticated()) {
      return next();
    }
    res.status(401).json({ message: "Unauthorized" });
  };

  const requireAdmin = (req: Request, res: Response, next: NextFunction) => {
    if (req.isAuthenticated() && req.user?.role === "admin") {
      return next();
    }
    res.status(403).json({ message: "Forbidden - Admin access required" });
  };

  app.post("/api/auth/login", (req, res, next) => {
    try {
      loginSchema.parse(req.body);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
    }

    passport.authenticate("local", (err: any, user: Express.User | false, info: any) => {
      if (err) {
        console.error("Login auth error:", err);
        return next(err);
      }
      if (!user) {
        return res.status(401).json({ message: info?.message || "Login failed" });
      }
      req.logIn(user, (loginErr) => {
        if (loginErr) {
          console.error("Login error:", loginErr);
          return next(loginErr);
        }
        console.log("User logged in successfully:", user.id);
        console.log("Session ID:", req.sessionID);
        return res.json({ user });
      });
    })(req, res, next);
  });

  app.post("/api/auth/signup", async (req, res) => {
    try {
      const data = signupSchema.parse(req.body);

      let user: any;
      let isUsingMockData = false;

      try {
        const existingUsername = await storage.getUserByUsername(data.username);
        if (existingUsername) {
          return res.status(400).json({ message: "Username already exists" });
        }

        const existingEmail = await storage.getUserByEmail(data.email);
        if (existingEmail) {
          return res.status(400).json({ message: "Email already exists" });
        }

        const hashedPassword = await bcrypt.hash(data.password, 10);

        user = await storage.createUser({
          username: data.username,
          email: data.email,
          fullName: data.fullName,
          password: hashedPassword,
          role: "admin",
          isActive: true,
        });
      } catch (dbErr) {
        // Fallback to mock user in development when database is unavailable
        if (process.env.NODE_ENV !== "production") {
          console.warn("Database unavailable, creating mock user for development");
          isUsingMockData = true;
          user = {
            id: `mock-${Date.now()}`,
            username: data.username,
            email: data.email,
            fullName: data.fullName,
            role: "admin",
            isActive: true,
          };
        } else {
          throw dbErr;
        }
      }

      const sessionUser = {
        id: user.id,
        username: user.username,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        isActive: user.isActive,
      };

      req.logIn(sessionUser, (err) => {
        if (err) {
          return res.status(500).json({ message: "Login failed after signup" });
        }
        if (isUsingMockData) {
          return res.json({
            user: sessionUser,
            warning: "Using mock data - database not available"
          });
        }
        return res.json({ user: sessionUser });
      });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      console.error("Signup error:", err);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/auth/logout", (req, res) => {
    req.logout((err) => {
      if (err) {
        return res.status(500).json({ message: "Logout failed" });
      }
      res.json({ message: "Logged out successfully" });
    });
  });

  app.get("/api/auth/me", (req, res) => {
    if (req.isAuthenticated()) {
      return res.json({ user: req.user });
    }
    return res.status(401).json({ message: "Not authenticated" });
  });

  app.patch("/api/auth/profile", requireAuth, async (req, res) => {
    try {
      const data = updateProfileSchema.parse(req.body);
      
      const user = await storage.getUser(req.user!.id);
      if (!user || !user.isActive) {
        return res.status(403).json({ message: "Account is inactive" });
      }
      
      const existingEmail = await storage.getUserByEmail(data.email);
      if (existingEmail && existingEmail.id !== req.user!.id) {
        return res.status(400).json({ message: "Email already in use" });
      }

      const updated = await storage.updateUser(req.user!.id, { 
        fullName: data.fullName, 
        email: data.email 
      });
      if (!updated) {
        return res.status(404).json({ message: "User not found" });
      }
      
      const { password, ...safeUser } = updated;
      res.json(safeUser);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      console.error("Profile update error:", err);
      res.status(500).json({ message: "Failed to update profile" });
    }
  });

  app.post("/api/auth/change-password", requireAuth, async (req, res) => {
    try {
      const data = changePasswordSchema.parse(req.body);

      const user = await storage.getUser(req.user!.id);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      if (!user.isActive) {
        return res.status(403).json({ message: "Account is inactive" });
      }

      const isValid = await bcrypt.compare(data.currentPassword, user.password);
      if (!isValid) {
        return res.status(400).json({ message: "Current password is incorrect" });
      }

      const hashedPassword = await bcrypt.hash(data.newPassword, 10);
      await storage.updateUser(req.user!.id, { password: hashedPassword });
      
      res.json({ message: "Password changed successfully" });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      console.error("Password change error:", err);
      res.status(500).json({ message: "Failed to change password" });
    }
  });

  // Update user theme preference
  app.patch("/api/auth/theme", requireAuth, async (req, res) => {
    try {
      const { theme } = req.body;
      if (typeof theme !== 'string') {
        return res.status(400).json({ message: "Theme must be a string" });
      }

      const updated = await storage.updateUser(req.user!.id, { theme });
      if (!updated) {
        return res.status(404).json({ message: "User not found" });
      }
      
      const { password, ...safeUser } = updated;
      res.json(safeUser);
    } catch (err) {
      console.error("Theme update error:", err);
      res.status(500).json({ message: "Failed to update theme" });
    }
  });

  app.get("/api/dashboard/stats", requireAuth, requireAdmin, async (req, res) => {
    try {
      const stats = await storage.getDashboardStats(req.user!.id);
      res.json(stats);
    } catch (err) {
      console.error("Dashboard stats error:", err);
      res.status(500).json({ message: "Failed to fetch stats" });
    }
  });

  app.get("/api/dashboard/activity", requireAuth, requireAdmin, async (req, res) => {
    try {
      const activity = await storage.getRecentActivity(req.user!.id, 10);
      res.json(activity);
    } catch (err) {
      console.error("Recent activity error:", err);
      res.status(500).json({ message: "Failed to fetch recent activity" });
    }
  });

  app.get("/api/team", requireAuth, requireAdmin, async (req, res) => {
    try {
      const adminId = req.user!.id;
      // Only show team members created by this admin (multi-tenant isolation)
      const allMembers = await storage.getTeamMembers();
      const myTeam = allMembers.filter(m => m.createdBy === adminId || m.id === adminId);
      
      // Get all phone numbers for this admin's gateway
      const phoneNumbers = await storage.getPhoneNumbers(adminId);
      
      // Add assigned phone numbers to each team member
      const safeMembers = myTeam.map(({ password, ...rest }) => {
        const assignedNumbers = phoneNumbers
          .filter((p: typeof phoneNumbers[0]) => p.assignedTo === rest.id)
          .map((p: typeof phoneNumbers[0]) => ({ id: p.id, number: p.number, friendlyName: p.friendlyName }));
        return { ...rest, assignedNumbers };
      });
      
      res.json(safeMembers);
    } catch (err) {
      console.error("Team fetch error:", err);
      res.status(500).json({ message: "Failed to fetch team members" });
    }
  });

  app.post("/api/team", requireAuth, requireAdmin, async (req, res) => {
    try {
      const data = createTeamMemberSchema.parse(req.body);

      const existingUsername = await storage.getUserByUsername(data.username);
      if (existingUsername) {
        return res.status(400).json({ message: "Username already exists" });
      }

      const existingEmail = await storage.getUserByEmail(data.email);
      if (existingEmail) {
        return res.status(400).json({ message: "Email already exists" });
      }

      const hashedPassword = await bcrypt.hash(data.password, 10);

      const user = await storage.createUser({
        username: data.username,
        email: data.email,
        fullName: data.fullName,
        password: hashedPassword,
        role: "team_member",
        isActive: true,
        createdBy: req.user!.id,
      });

      const { password, ...safeUser } = user;
      res.json(safeUser);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      console.error("Create team member error:", err);
      res.status(500).json({ message: "Failed to create team member" });
    }
  });

  app.patch("/api/team/:id", requireAuth, requireAdmin, async (req, res) => {
    try {
      const id = req.params.id as string;
      const { isActive } = req.body;

      const user = await storage.updateUser(id, { isActive });
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const { password, ...safeUser } = user;
      res.json(safeUser);
    } catch (err) {
      console.error("Update team member error:", err);
      res.status(500).json({ message: "Failed to update team member" });
    }
  });

  app.delete("/api/team/:id", requireAuth, requireAdmin, async (req, res) => {
    try {
      const id = req.params.id as string;
      const user = await storage.getUser(id);
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      if (user.role === "admin") {
        return res.status(403).json({ message: "Cannot delete admin users" });
      }
      
      await storage.deleteUser(id);
      res.json({ message: "User deleted successfully" });
    } catch (err) {
      console.error("Delete team member error:", err);
      res.status(500).json({ message: "Failed to delete team member" });
    }
  });

  app.post("/api/team/:id/reset-password", requireAuth, requireAdmin, async (req, res) => {
    try {
      const id = req.params.id as string;
      const user = await storage.getUser(id);
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      if (user.role === "admin") {
        return res.status(403).json({ message: "Cannot reset admin password" });
      }

      const bcrypt = await import("bcrypt");
      const { randomBytes } = await import("crypto");
      const randomPassword = randomBytes(16).toString('hex');
      const hashedPassword = await bcrypt.hash(randomPassword, 10);
      await storage.updateUser(id, { password: hashedPassword });

      res.json({
        message: "Password reset successfully",
        temporaryPassword: randomPassword,
        note: "User should change this password on next login"
      });
    } catch (err) {
      console.error("Reset password error:", err);
      res.status(500).json({ message: "Failed to reset password" });
    }
  });

  app.get("/api/team/:id/assignments", requireAuth, requireAdmin, async (req, res) => {
    try {
      const teamMemberId = req.params.id as string;
      const adminId = req.user!.id;
      
      console.log(`Getting assignments for team member: ${teamMemberId}, admin: ${adminId}`);
      const assignments = await storage.getPhoneNumberAssignments(adminId, teamMemberId);
      console.log(`Assignments result:`, JSON.stringify(assignments.map(a => ({ id: a.id, number: a.number, assignedTo: a.assignedTo, isAssigned: a.isAssigned }))));
      res.json(assignments);
    } catch (err) {
      console.error("Get assignments error:", err);
      res.status(500).json({ message: "Failed to fetch assignments" });
    }
  });

  app.post("/api/team/:id/assignments", requireAuth, requireAdmin, async (req, res) => {
    try {
      const teamMemberId = req.params.id as string;
      const { phoneNumberId } = req.body;
      const adminId = req.user!.id;
      
      if (!phoneNumberId) {
        return res.status(400).json({ message: "Phone number ID is required" });
      }
      
      // Verify the team member exists and is a team member (not an admin)
      const teamMember = await storage.getUser(teamMemberId);
      if (!teamMember) {
        return res.status(404).json({ message: "Team member not found" });
      }
      if (teamMember.role === "admin") {
        return res.status(400).json({ message: "Cannot assign numbers to admin accounts" });
      }
      
      const phoneNumber = await storage.getPhoneNumber(phoneNumberId);
      if (!phoneNumber) {
        return res.status(404).json({ message: "Phone number not found" });
      }
      
      const gateway = phoneNumber.gatewayId ? await storage.getSmsGateway(phoneNumber.gatewayId) : null;
      if (!gateway || gateway.adminId !== adminId) {
        return res.status(403).json({ message: "You can only assign phone numbers from your gateway" });
      }
      
      if (phoneNumber.assignedTo && phoneNumber.assignedTo !== teamMemberId) {
        return res.status(409).json({ message: "This number is already assigned to another team member" });
      }
      
      await storage.assignPhoneNumber(phoneNumberId, teamMemberId);
      
      // Notify team member via WebSocket about new assignment
      broadcastToUser(teamMemberId, { 
        type: "phone_assignment_changed",
        action: "assigned",
        phoneNumberId,
        phoneNumber: phoneNumber.number,
      });
      
      res.json({ message: "Phone number assigned successfully" });
    } catch (err) {
      console.error("Assign phone number error:", err);
      res.status(500).json({ message: "Failed to assign phone number" });
    }
  });

  app.delete("/api/team/:id/assignments/:phoneNumberId", requireAuth, requireAdmin, async (req, res) => {
    try {
      const teamMemberId = req.params.id as string;
      const phoneNumberId = req.params.phoneNumberId as string;
      const adminId = req.user!.id;
      
      const phoneNumber = await storage.getPhoneNumber(phoneNumberId);
      if (!phoneNumber) {
        return res.status(404).json({ message: "Phone number not found" });
      }
      
      const gateway = phoneNumber.gatewayId ? await storage.getSmsGateway(phoneNumber.gatewayId) : null;
      if (!gateway || gateway.adminId !== adminId) {
        return res.status(403).json({ message: "You can only unassign phone numbers from your gateway" });
      }
      
      if (phoneNumber.assignedTo !== teamMemberId) {
        return res.status(400).json({ message: "This number is not assigned to this team member" });
      }
      
      await storage.unassignPhoneNumber(phoneNumberId);
      
      // Notify team member via WebSocket about removed assignment
      broadcastToUser(teamMemberId, { 
        type: "phone_assignment_changed",
        action: "unassigned",
        phoneNumberId,
        phoneNumber: phoneNumber.number,
      });
      
      res.json({ message: "Phone number unassigned successfully" });
    } catch (err) {
      console.error("Unassign phone number error:", err);
      res.status(500).json({ message: "Failed to unassign phone number" });
    }
  });

  app.get("/api/signalwire/status", requireAuth, requireAdmin, async (req, res) => {
    try {
      // Check if admin has any active SignalWire gateway
      const gateways = await storage.getSmsGateways(req.user!.id);
      const signalwireGateway = gateways.find(g => g.provider === "signalwire" && g.isActive);

      res.json({
        configured: !!signalwireGateway,
        projectId: signalwireGateway ? "(configured via gateway)" : undefined,
        spaceUrl: signalwireGateway ? "(configured via gateway)" : undefined,
      });
    } catch (err) {
      console.error("SignalWire status error:", err);
      res.status(500).json({ message: "Failed to check SignalWire status" });
    }
  });

  app.get("/api/phone-numbers", requireAuth, async (req, res) => {
    try {
      const user = req.user!;
      
      // For team members, directly get their assigned phone numbers
      if (user.role === "team_member") {
        const phones = await storage.getPhoneNumbersAssignedToUser(user.id);
        return res.json(phones);
      }
      
      // For admins, get phone numbers from their gateway
      const { gateway } = await getProviderContext(user.id);
      const gatewayId = gateway?.id;
      
      if (!gatewayId) {
        return res.json([]);
      }
      
      const allPhones = await storage.getPhoneNumbers(undefined, gatewayId);
      
      // If includeAssigned=true (for Bought Numbers page), return all
      // Otherwise filter out assigned numbers (for Conversations dropdown)
      const includeAssigned = req.query.includeAssigned === "true";
      const phones = includeAssigned ? allPhones : allPhones.filter(phone => !phone.assignedTo);
      res.json(phones);
    } catch (err) {
      console.error("Phone numbers fetch error:", err);
      res.status(500).json({ message: "Failed to fetch phone numbers" });
    }
  });

  app.post("/api/phone-numbers/sync", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { provider, adminId, gateway } = await getProviderContext(req.user!.id);
      if (!provider.isConfigured() || !adminId) {
        return res.status(503).json({ message: "No SMS gateway configured. Please connect one in Settings > Integrations." });
      }

      const ownedNumbers = await provider.getOwnedNumbers();

      let synced = 0;
      let skipped = 0;
      for (const num of ownedNumbers) {
        try {
          // Check if number already exists globally
          const existingNumber = await storage.getPhoneNumberByNumber(num.number);
          if (existingNumber) {
            // Number already exists - skip
            skipped++;
            continue;
          }
          
          await storage.createPhoneNumber({
            number: num.number,
            friendlyName: num.friendlyName || "Phone Number",
            providerId: num.id,
            provider: gateway?.provider || "signalwire",
            gatewayId: gateway?.id,
            adminId: adminId!,
            capabilities: num.capabilities || ["sms", "voice"],
            isActive: true,
            monthlyRate: "$1.15",
          });
          synced++;
        } catch (err: any) {
          // Handle duplicate key error gracefully
          if (err.code === '23505') {
            skipped++;
            continue;
          }
          throw err;
        }
      }

      res.json({ message: `Synced ${synced} numbers from ${gateway?.provider || "provider"}`, synced, skipped });
    } catch (err: any) {
      console.error("Sync numbers error:", err);
      res.status(500).json({ message: err.message || "Failed to sync numbers" });
    }
  });

  app.get("/api/phone-numbers/available", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { areaCode, country, region } = req.query;
      
      const provider = await getProviderForUser(req.user!.id);
      if (!provider.isConfigured()) {
        return res.status(503).json({ message: "No SMS gateway configured. Please connect one in Settings > Integrations." });
      }

      const numbers = await provider.getAvailableNumbers({
        areaCode: areaCode as string | undefined,
        country: (country as string) || "US",
        region: region as string | undefined,
      });
      res.json(numbers);
    } catch (err: any) {
      console.error("Available numbers error:", err);
      res.status(500).json({ message: err.message || "Failed to fetch available numbers" });
    }
  });

  app.post("/api/phone-numbers/purchase", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { number } = req.body;
      if (!number) {
        return res.status(400).json({ message: "Phone number is required" });
      }

      const { provider, adminId, gateway } = await getProviderContext(req.user!.id);
      if (!provider.isConfigured()) {
        return res.status(503).json({ message: "No SMS gateway configured. Please connect one in Settings > Integrations." });
      }

      const purchasedNumber = await provider.purchaseNumber(number);

      const phone = await storage.createPhoneNumber({
        number: purchasedNumber.number,
        friendlyName: purchasedNumber.friendlyName || "Purchased Number",
        providerId: purchasedNumber.id,
        provider: gateway?.provider || "signalwire",
        gatewayId: gateway?.id,
        adminId: adminId!,
        capabilities: ["sms", "voice", "mms"],
        isActive: true,
        monthlyRate: "$1.15",
      });

      res.json(phone);
    } catch (err: any) {
      console.error("Purchase number error:", err);
      res.status(500).json({ message: err.message || "Failed to purchase number" });
    }
  });

  app.get("/api/conversations", requireAuth, async (req, res) => {
    try {
      const user = req.user!;
      
      if (user.role === "admin") {
        // Get admin's phone numbers and filter conversations by them
        const { gateway } = await getProviderContext(user.id);
        if (!gateway) {
          return res.json([]);
        }
        const adminPhones = await storage.getPhoneNumbers(undefined, gateway.id);
        const phoneIds = new Set(adminPhones.map(p => p.id));
        
        const allConversations = await storage.getConversations();
        const myConversations = allConversations.filter(c => 
          c.phoneNumberId && phoneIds.has(c.phoneNumberId)
        );
        return res.json(myConversations);
      } else {
        // Team member sees conversations for phone numbers assigned to them
        const assignedPhones = await storage.getPhoneNumbersAssignedToUser(user.id);
        if (assignedPhones.length === 0) {
          return res.json([]);
        }
        const phoneIds = new Set(assignedPhones.map(p => p.id));
        
        const allConversations = await storage.getConversations();
        const myConversations = allConversations.filter(c => 
          c.phoneNumberId && phoneIds.has(c.phoneNumberId)
        );
        return res.json(myConversations);
      }
    } catch (err) {
      console.error("Conversations fetch error:", err);
      res.status(500).json({ message: "Failed to fetch conversations" });
    }
  });

  app.post("/api/conversations", requireAuth, async (req, res) => {
    try {
      const { contactNumber, contactName, phoneNumberId, assignedUserId, category } = req.body;

      if (!contactNumber) {
        return res.status(400).json({ message: "Contact phone number is required" });
      }

      const formattedContactNumber = formatToE164(contactNumber);

      const conversation = await storage.createConversation({
        contactNumber: formattedContactNumber,
        contactName: contactName || null,
        phoneNumberId: phoneNumberId || null,
        assignedUserId: req.user?.role === "admin" ? (assignedUserId || null) : req.user!.id,
        category: category || "general",
        unreadCount: 0,
        isArchived: false,
      });

      res.json(conversation);
    } catch (err) {
      console.error("Create conversation error:", err);
      res.status(500).json({ message: "Failed to create conversation" });
    }
  });

  app.patch("/api/conversations/:id", requireAuth, async (req, res) => {
    try {
      const id = req.params.id as string;
      const { contactName, isPinned, category } = req.body;
      
      const conversation = await storage.getConversation(id);
      if (!conversation) {
        return res.status(404).json({ message: "Conversation not found" });
      }
      
      if (req.user?.role !== "admin" && conversation.assignedUserId !== req.user?.id) {
        return res.status(403).json({ message: "Access denied to this conversation" });
      }
      
      const updates: any = {};
      if (contactName !== undefined) updates.contactName = contactName;
      if (isPinned !== undefined) updates.isPinned = isPinned;
      if (category !== undefined) updates.category = category;
      
      const updated = await storage.updateConversation(id, updates);
      res.json(updated);
    } catch (err) {
      console.error("Update conversation error:", err);
      res.status(500).json({ message: "Failed to update conversation" });
    }
  });

  // Mark conversation as read (reset unread count)
  app.post("/api/conversations/:id/read", requireAuth, async (req, res) => {
    try {
      const id = req.params.id as string;
      
      const conversation = await storage.getConversation(id);
      if (!conversation) {
        return res.status(404).json({ message: "Conversation not found" });
      }
      
      // Check access: admin has full access, team member needs assigned phone number
      if (req.user?.role !== "admin") {
        const assignedPhones = await storage.getPhoneNumbersAssignedToUser(req.user!.id);
        const phoneIds = new Set(assignedPhones.map(p => p.id));
        if (!conversation.phoneNumberId || !phoneIds.has(conversation.phoneNumberId)) {
          return res.status(403).json({ message: "Access denied to this conversation" });
        }
      }
      
      const updated = await storage.updateConversation(id, { unreadCount: 0 });
      res.json(updated);
    } catch (err) {
      console.error("Mark as read error:", err);
      res.status(500).json({ message: "Failed to mark as read" });
    }
  });

  app.delete("/api/conversations/:id", requireAuth, async (req, res) => {
    try {
      const id = req.params.id as string;
      
      const conversation = await storage.getConversation(id);
      if (!conversation) {
        return res.status(404).json({ message: "Conversation not found" });
      }
      
      if (req.user?.role !== "admin" && conversation.assignedUserId !== req.user?.id) {
        return res.status(403).json({ message: "Access denied to this conversation" });
      }
      
      await storage.deleteConversation(id);
      res.json({ success: true });
    } catch (err) {
      console.error("Delete conversation error:", err);
      res.status(500).json({ message: "Failed to delete conversation" });
    }
  });

  app.get("/api/conversations/:id/messages", requireAuth, async (req, res) => {
    try {
      const id = req.params.id as string;
      
      const conversation = await storage.getConversation(id);
      if (!conversation) {
        return res.status(404).json({ message: "Conversation not found" });
      }
      
      // Check access: admin has full access, team member needs assigned phone number
      if (req.user?.role !== "admin") {
        const assignedPhones = await storage.getPhoneNumbersAssignedToUser(req.user!.id);
        const phoneIds = new Set(assignedPhones.map(p => p.id));
        if (!conversation.phoneNumberId || !phoneIds.has(conversation.phoneNumberId)) {
          return res.status(403).json({ message: "Access denied to this conversation" });
        }
      }
      
      const messages = await storage.getMessages(id);
      res.json(messages);
    } catch (err) {
      console.error("Messages fetch error:", err);
      res.status(500).json({ message: "Failed to fetch messages" });
    }
  });

  app.post("/api/conversations/:id/messages", requireAuth, async (req, res) => {
    try {
      const id = req.params.id as string;
      const { content } = req.body;

      if (!content) {
        return res.status(400).json({ message: "Message content is required" });
      }

      const conversation = await storage.getConversation(id);
      if (!conversation) {
        return res.status(404).json({ message: "Conversation not found" });
      }

      // Check access: admin has full access, team member needs assigned phone number
      if (req.user?.role !== "admin") {
        const assignedPhones = await storage.getPhoneNumbersAssignedToUser(req.user!.id);
        const phoneIds = new Set(assignedPhones.map(p => p.id));
        if (!conversation.phoneNumberId || !phoneIds.has(conversation.phoneNumberId)) {
          return res.status(403).json({ message: "Access denied to this conversation" });
        }
      }

      let smsStatus: "pending" | "sent" | "delivered" | "failed" = "pending";
      let providerMessageId: string | undefined = undefined;

      if (conversation.phoneNumberId) {
        const phoneNumber = await storage.getPhoneNumber(conversation.phoneNumberId);
        if (phoneNumber && phoneNumber.gatewayId && conversation.contactNumber) {
          // Get the gateway from the phone number, not from the user
          // This ensures team members use the correct admin's gateway
          const gateway = await storage.getSmsGateway(phoneNumber.gatewayId);
          if (gateway) {
            const provider = createSmsProvider(gateway);
            if (provider.isConfigured()) {
              try {
                // Use configured base URL instead of untrusted headers
                const publicBaseUrl = process.env.PUBLIC_BASE_URL || 'https://localhost:5000';
                const statusCallback = `${publicBaseUrl}/api/webhooks/sms/status`;
                
                const smsResult = await provider.sendSms({
                  from: formatToE164(phoneNumber.number),
                  to: formatToE164(conversation.contactNumber),
                  body: content,
                  statusCallback,
                });
                providerMessageId = smsResult.id;
                smsStatus = smsResult.status === "queued" || smsResult.status === "sent" ? "sent" : "failed";
              } catch (smsError) {
                console.error("SMS send error:", smsError);
                smsStatus = "failed";
              }
            }
          }
        }
      }

      const message = await storage.createMessage({
        conversationId: id as string,
        senderId: req.user!.id,
        content: content as string,
        direction: "outbound",
        status: smsStatus,
        signalwireMessageId: providerMessageId,
      });

      await storage.updateConversation(id as string, {
        lastMessageAt: new Date(),
        lastMessagePreview: (content as string).substring(0, 100),
      });

      broadcastToConversation(id as string, { type: "new_message", message, conversation });
      
      // Broadcast to the sender
      broadcastToUser(req.user!.id, { 
        type: "conversation_updated", 
        conversationId: id,
        lastMessageAt: new Date(),
        lastMessagePreview: (content as string).substring(0, 100),
      });

      // Also broadcast to assigned team member or admin if different from sender
      if (conversation.phoneNumberId) {
        const phoneNumber = await storage.getPhoneNumber(conversation.phoneNumberId);
        if (phoneNumber) {
          // If sender is admin, notify assigned team member
          if (req.user!.role === "admin" && phoneNumber.assignedTo && phoneNumber.assignedTo !== req.user!.id) {
            broadcastToUser(phoneNumber.assignedTo, { 
              type: "new_message", 
              message, 
              conversation,
              conversationId: id,
            });
          }
          // If sender is team member, notify admin
          if (req.user!.role === "team_member" && phoneNumber.adminId && phoneNumber.adminId !== req.user!.id) {
            broadcastToUser(phoneNumber.adminId, { 
              type: "new_message", 
              message, 
              conversation,
              conversationId: id,
            });
          }
        }
      }

      res.json(message);
    } catch (err) {
      console.error("Send message error:", err);
      res.status(500).json({ message: "Failed to send message" });
    }
  });

  app.get("/api/insights", requireAuth, requireAdmin, async (req, res) => {
    try {
      const insights = await storage.getMessageInsightsForAdmin(req.user!.id);
      res.json(insights);
    } catch (err) {
      console.error("Insights fetch error:", err);
      res.status(500).json({ message: "Failed to fetch insights" });
    }
  });

  // SMS Gateway Integration Routes
  app.get("/api/integrations/gateways", requireAuth, async (req, res) => {
    try {
      if (req.user?.role !== "admin") {
        return res.status(403).json({ message: "Only admins can manage integrations" });
      }
      
      const gateways = await storage.getSmsGateways(req.user.id);
      // Return gateways without exposing credentials
      const safeGateways = gateways.map(g => ({
        ...g,
        credentials: undefined,
        hasCredentials: true
      }));
      res.json(safeGateways);
    } catch (err) {
      console.error("Get gateways error:", err);
      res.status(500).json({ message: "Failed to fetch gateways" });
    }
  });

  app.get("/api/integrations/gateways/active", requireAuth, async (req, res) => {
    try {
      // Get admin ID - for team members, get their creator's admin ID
      let adminId = req.user?.id;
      if (req.user?.role === "team_member") {
        const user = await storage.getUser(req.user.id);
        adminId = user?.createdBy || req.user.id;
      }
      
      const gateway = await storage.getActiveSmsGateway(adminId!);
      if (!gateway) {
        return res.json(null);
      }
      
      res.json({
        ...gateway,
        credentials: undefined,
        hasCredentials: true
      });
    } catch (err) {
      console.error("Get active gateway error:", err);
      res.status(500).json({ message: "Failed to fetch active gateway" });
    }
  });

  app.post("/api/integrations/gateways", requireAuth, async (req, res) => {
    try {
      if (req.user?.role !== "admin") {
        return res.status(403).json({ message: "Only admins can manage integrations" });
      }
      
      const validated = connectGatewaySchema.parse(req.body);
      
      // Test credentials before saving - create a temporary provider
      const tempGateway = {
        id: "temp",
        adminId: req.user.id,
        provider: validated.provider as SmsProvider,
        name: validated.name,
        credentials: validated.credentials as unknown as string,
        isActive: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      
      const tempProvider = createSmsProvider(tempGateway);
      const testResult = await tempProvider.testConnection();
      
      if (!testResult.success) {
        console.error("Gateway connection test failed:", testResult.error);
        return res.status(400).json({ 
          message: "Connection failed", 
          error: testResult.error || "Please check your credentials and try again."
        });
      }
      
      // Check if this is the first gateway for this admin
      const existingGateways = await storage.getSmsGateways(req.user.id);
      const isFirstGateway = existingGateways.length === 0;
      
      // Encrypt credentials before storing
      const encryptedCredentials = encryptCredentials(JSON.stringify(validated.credentials));
      
      const gateway = await storage.createSmsGateway({
        adminId: req.user.id,
        provider: validated.provider as SmsProvider,
        name: validated.name,
        credentials: encryptedCredentials,
        isActive: isFirstGateway,
      });
      
      // Auto-sync phone numbers from the new gateway
      let syncedCount = 0;
      if (isFirstGateway) {
        try {
          const provider = createSmsProvider(gateway);
          const ownedNumbers = await provider.getOwnedNumbers();
          
          for (const num of ownedNumbers) {
            try {
              const existingNumber = await storage.getPhoneNumberByNumber(num.number);
              if (!existingNumber) {
                await storage.createPhoneNumber({
                  number: num.number,
                  friendlyName: num.friendlyName,
                  providerId: num.id,
                  provider: gateway.provider,
                  gatewayId: gateway.id,
                  adminId: req.user.id,
                  capabilities: num.capabilities,
                });
                syncedCount++;
              }
            } catch (syncErr) {
              console.error(`Failed to sync number ${num.number}:`, syncErr);
            }
          }
          console.log(`Auto-synced ${syncedCount} phone numbers for new gateway ${gateway.id}`);
        } catch (syncErr) {
          console.error("Auto-sync failed:", syncErr);
        }
      }
      
      res.json({
        ...gateway,
        credentials: undefined,
        hasCredentials: true,
        syncedNumbers: syncedCount
      });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid gateway data", errors: err.errors });
      }
      console.error("Create gateway error:", err);
      res.status(500).json({ message: "Failed to create gateway" });
    }
  });

  app.patch("/api/integrations/gateways/:id/activate", requireAuth, async (req, res) => {
    try {
      if (req.user?.role !== "admin") {
        return res.status(403).json({ message: "Only admins can manage integrations" });
      }
      
      const gatewayId = req.params.id as string;
      const gateway = await storage.setActiveSmsGateway(req.user.id, gatewayId);
      if (!gateway) {
        return res.status(404).json({ message: "Gateway not found" });
      }
      
      res.json({
        ...gateway,
        credentials: undefined,
        hasCredentials: true
      });
    } catch (err) {
      console.error("Activate gateway error:", err);
      res.status(500).json({ message: "Failed to activate gateway" });
    }
  });

  app.delete("/api/integrations/gateways/:id", requireAuth, async (req, res) => {
    try {
      if (req.user?.role !== "admin") {
        return res.status(403).json({ message: "Only admins can manage integrations" });
      }
      
      const gatewayId = req.params.id as string;
      const gateway = await storage.getSmsGateway(gatewayId);
      if (!gateway || gateway.adminId !== req.user.id) {
        return res.status(404).json({ message: "Gateway not found" });
      }
      
      // First, clear phoneNumberId from conversations that reference these phone numbers
      await storage.clearConversationPhoneNumbers(gatewayId);
      console.log(`Cleared phone number references from conversations for gateway ${gatewayId}`);
      
      // Now delete associated phone numbers
      const deletedNumbers = await storage.deletePhoneNumbersByGateway(gatewayId);
      console.log(`Deleted ${deletedNumbers} phone numbers for gateway ${gatewayId}`);
      
      await storage.deleteSmsGateway(gatewayId);
      res.json({ success: true, deletedNumbers });
    } catch (err) {
      console.error("Delete gateway error:", err);
      res.status(500).json({ message: "Failed to delete gateway" });
    }
  });

  // ============== SMS WEBHOOKS ==============
  // These endpoints receive callbacks from SMS providers (Twilio, SignalWire, Telnyx)
  
  // Inbound SMS webhook - receives incoming messages
  app.post("/api/webhooks/sms/inbound", async (req, res) => {
    try {
      // Webhook signature verification
      const rawBody = req.rawBody as Buffer | undefined;
      if (!rawBody) {
        return res.status(400).json({ message: "Missing request body" });
      }

      const twilioSignature = req.headers['x-twilio-signature'] as string;
      if (twilioSignature) {
        const authToken = process.env.TWILIO_AUTH_TOKEN;
        if (!authToken || !verifyTwilioSignature(
          req.originalUrl,
          rawBody.toString(),
          twilioSignature,
          authToken
        )) {
          console.error("Invalid Twilio webhook signature");
          return res.status(401).json({ message: "Invalid signature" });
        }
      }

      const signalWireSignature = req.headers['x-signalwire-signature'] as string;
      if (signalWireSignature) {
        const token = process.env.SIGNALWIRE_TOKEN;
        if (!token || !verifySignalWireSignature(
          rawBody.toString(),
          signalWireSignature,
          token
        )) {
          console.error("Invalid SignalWire webhook signature");
          return res.status(401).json({ message: "Invalid signature" });
        }
      }

      console.log("Inbound SMS webhook received:", JSON.stringify(req.body, null, 2));
      
      // Determine provider from request format
      let fromNumber: string;
      let toNumber: string;
      let messageBody: string;
      let providerMessageId: string;
      
      // Twilio/SignalWire format
      if (req.body.From && req.body.To && req.body.Body !== undefined) {
        fromNumber = formatToE164(req.body.From);
        toNumber = formatToE164(req.body.To);
        messageBody = req.body.Body || "";
        providerMessageId = req.body.MessageSid || req.body.SmsSid || "";
      }
      // Telnyx format
      else if (req.body.data?.payload) {
        const payload = req.body.data.payload;
        fromNumber = formatToE164(payload.from?.phone_number || "");
        toNumber = formatToE164(payload.to?.[0]?.phone_number || payload.to || "");
        messageBody = payload.text || "";
        providerMessageId = payload.id || "";
      }
      else {
        console.error("Unknown webhook format:", req.body);
        return res.status(400).json({ message: "Unknown webhook format" });
      }
      
      // Find the phone number in our system
      const phoneNumber = await storage.getPhoneNumberByNumber(toNumber);
      if (!phoneNumber) {
        console.error(`Phone number not found: ${toNumber}`);
        return res.status(404).json({ message: "Phone number not found" });
      }
      
      // Find or create conversation
      let conversation = await storage.getConversationByPhoneAndContact(
        phoneNumber.id,
        fromNumber
      );
      
      if (!conversation) {
        // Create new conversation for this inbound message
        // If phone number is assigned to a team member, assign conversation to them
        conversation = await storage.createConversation({
          phoneNumberId: phoneNumber.id,
          contactNumber: fromNumber,
          contactName: null,
          category: "general",
          assignedUserId: phoneNumber.assignedTo || null,
        });
      }
      
      // Create the inbound message
      const message = await storage.createMessage({
        conversationId: conversation.id,
        content: messageBody,
        direction: "inbound",
        status: "delivered",
        senderId: null,
        signalwireMessageId: providerMessageId,
      });
      
      // Update conversation with incremented unread count and last message
      await storage.updateConversation(conversation.id, {
        unreadCount: (conversation.unreadCount || 0) + 1,
        lastMessagePreview: messageBody,
        lastMessageAt: new Date(),
      });
      
      // Prepare WebSocket message
      const wsMessageData = JSON.stringify({
        type: "new_inbound_message",
        conversationId: conversation!.id,
        phoneNumberId: phoneNumber.id,
        message: {
          ...message,
          senderName: conversation!.contactName || fromNumber,
        },
      });
      
      // Broadcast to admin user
      const adminWsClients = phoneNumber.adminId ? userClients.get(phoneNumber.adminId) : null;
      if (adminWsClients) {
        adminWsClients.forEach((client) => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(wsMessageData);
            console.log(`Sent new_inbound_message to admin WebSocket client`);
          }
        });
      }
      
      // Also broadcast to assigned team member (if different from admin)
      if (phoneNumber.assignedTo && phoneNumber.assignedTo !== phoneNumber.adminId) {
        const teamMemberWsClients = userClients.get(phoneNumber.assignedTo);
        if (teamMemberWsClients) {
          teamMemberWsClients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
              client.send(wsMessageData);
            }
          });
        }
      }
      
      console.log(`Inbound message saved: ${message.id} from ${fromNumber} to ${toNumber}`);
      
      // Respond with TwiML for Twilio/SignalWire (empty response)
      res.type("text/xml").send("<?xml version=\"1.0\" encoding=\"UTF-8\"?><Response></Response>");
    } catch (err) {
      console.error("Inbound webhook error:", err);
      res.status(500).json({ message: "Webhook processing failed" });
    }
  });
  
  // Status callback webhook - receives delivery status updates
  app.post("/api/webhooks/sms/status", async (req, res) => {
    try {
      // Webhook signature verification
      const rawBody = req.rawBody as Buffer | undefined;
      if (!rawBody) {
        return res.status(400).json({ message: "Missing request body" });
      }

      const twilioSignature = req.headers['x-twilio-signature'] as string;
      if (twilioSignature) {
        const authToken = process.env.TWILIO_AUTH_TOKEN;
        if (!authToken || !verifyTwilioSignature(
          req.originalUrl,
          rawBody.toString(),
          twilioSignature,
          authToken
        )) {
          console.error("Invalid Twilio webhook signature");
          return res.status(401).json({ message: "Invalid signature" });
        }
      }

      const signalWireSignature = req.headers['x-signalwire-signature'] as string;
      if (signalWireSignature) {
        const token = process.env.SIGNALWIRE_TOKEN;
        if (!token || !verifySignalWireSignature(
          rawBody.toString(),
          signalWireSignature,
          token
        )) {
          console.error("Invalid SignalWire webhook signature");
          return res.status(401).json({ message: "Invalid signature" });
        }
      }

      console.log("Status webhook received:", JSON.stringify(req.body, null, 2));
      
      let providerMessageId: string;
      let status: string;
      let errorCode: string | null = null;
      
      // Twilio/SignalWire format
      if (req.body.MessageSid || req.body.SmsSid) {
        providerMessageId = req.body.MessageSid || req.body.SmsSid;
        const rawStatus = (req.body.MessageStatus || req.body.SmsStatus || "").toLowerCase();
        
        // Map provider status to our status
        switch (rawStatus) {
          case "queued":
          case "accepted":
            status = "pending";
            break;
          case "sending":
          case "sent":
            status = "sent";
            break;
          case "delivered":
            status = "delivered";
            break;
          case "undelivered":
          case "failed":
            status = "failed";
            errorCode = req.body.ErrorCode || null;
            break;
          default:
            status = "sent";
        }
      }
      // Telnyx format
      else if (req.body.data?.payload) {
        const payload = req.body.data.payload;
        providerMessageId = payload.id || "";
        const rawStatus = (payload.to?.[0]?.status || "").toLowerCase();
        
        switch (rawStatus) {
          case "queued":
            status = "pending";
            break;
          case "sending":
          case "sent":
            status = "sent";
            break;
          case "delivered":
            status = "delivered";
            break;
          case "delivery_failed":
          case "sending_failed":
            status = "failed";
            break;
          default:
            status = "sent";
        }
      }
      else {
        console.error("Unknown status webhook format:", req.body);
        return res.status(400).json({ message: "Unknown webhook format" });
      }
      
      // Find and update the message
      const message = await storage.getMessageBySignalwireId(providerMessageId);
      if (message) {
        await storage.updateMessage(message.id, { status: status as any });
        
        // Broadcast status update via WebSocket
        const wsMessage = {
          type: "message_status",
          messageId: message.id,
          conversationId: message.conversationId,
          status,
          errorCode,
        };
        const wsMessageStr = JSON.stringify(wsMessage);
        
        // Broadcast to conversation subscribers
        clients.get(message.conversationId)?.forEach((client) => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(wsMessageStr);
          }
        });
        
        // Also broadcast to the sender's user connection for real-time updates
        if (message.senderId) {
          userClients.get(message.senderId)?.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
              client.send(wsMessageStr);
            }
          });
        }
        
        console.log(`Message ${message.id} status updated to: ${status}`);
      } else {
        console.log(`Message not found for provider ID: ${providerMessageId}`);
      }
      
      res.status(200).json({ success: true });
    } catch (err) {
      console.error("Status webhook error:", err);
      res.status(500).json({ message: "Webhook processing failed" });
    }
  });

  const wss = new WebSocketServer({ server: httpServer, path: "/ws" });

  wss.on("connection", (ws) => {
    let subscribedConversations = new Set<string>();
    let authenticatedUser: Express.User | null = null;
    let authenticatedUserId: string | null = null;

    ws.on("message", async (data) => {
      try {
        const message = JSON.parse(data.toString());

        if (message.type === "auth") {
          const userId = message.userId;
          if (userId) {
            const user = await storage.getUser(userId);
            if (user) {
              authenticatedUser = {
                id: user.id,
                username: user.username,
                email: user.email,
                fullName: user.fullName,
                role: user.role,
                isActive: user.isActive,
              };
              authenticatedUserId = user.id;
              
              if (!userClients.has(user.id)) {
                userClients.set(user.id, new Set());
              }
              userClients.get(user.id)!.add(ws);
              console.log(`WebSocket authenticated for user ${user.id} (${user.username}). Total clients: ${userClients.get(user.id)?.size}`);
              
              ws.send(JSON.stringify({ type: "auth_success" }));
            } else {
              ws.send(JSON.stringify({ type: "auth_error", message: "Invalid user" }));
            }
          }
          return;
        }

        if (!authenticatedUser) {
          ws.send(JSON.stringify({ type: "error", message: "Not authenticated" }));
          return;
        }

        if (message.type === "subscribe") {
          const conversationId = message.conversationId;
          
          const conversation = await storage.getConversation(conversationId);
          if (!conversation) {
            ws.send(JSON.stringify({ type: "error", message: "Conversation not found" }));
            return;
          }
          
          if (authenticatedUser.role !== "admin" && conversation.assignedUserId !== authenticatedUser.id) {
            ws.send(JSON.stringify({ type: "error", message: "Access denied to this conversation" }));
            return;
          }
          
          subscribedConversations.add(conversationId);

          if (!clients.has(conversationId)) {
            clients.set(conversationId, new Set());
          }
          clients.get(conversationId)!.add(ws);
          ws.send(JSON.stringify({ type: "subscribed", conversationId }));
        }

        if (message.type === "unsubscribe") {
          const conversationId = message.conversationId;
          subscribedConversations.delete(conversationId);
          clients.get(conversationId)?.delete(ws);
        }
      } catch (err) {
        console.error("WebSocket message error:", err);
      }
    });

    ws.on("close", () => {
      subscribedConversations.forEach((conversationId) => {
        clients.get(conversationId)?.delete(ws);
      });
      if (authenticatedUserId) {
        userClients.get(authenticatedUserId)?.delete(ws);
      }
    });
  });

  return httpServer;
}
