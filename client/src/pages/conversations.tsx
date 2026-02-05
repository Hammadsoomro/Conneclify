import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { useWebSocket } from "@/hooks/use-websocket";
import type { Conversation, Message, PhoneNumber } from "@shared/schema";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { Label } from "@/components/ui/label";
import {
  MessageSquare,
  Send,
  Search,
  Phone,
  MoreVertical,
  User,
  Loader2,
  Plus,
  Pencil,
  Pin,
  FolderInput,
  Trash2,
  Check,
  CheckCheck,
  Clock,
  AlertCircle,
} from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { format, isToday, isYesterday } from "date-fns";

interface ConversationWithMessages extends Conversation {
  messages?: Message[];
}

function MessageStatusIcon({ status, isOutbound }: { status: string; isOutbound: boolean }) {
  if (!isOutbound) return null;
  
  switch (status) {
    case "pending":
      return <Clock className="h-3 w-3" />;
    case "sent":
      return <Check className="h-3 w-3" />;
    case "delivered":
      return <CheckCheck className="h-3 w-3" />;
    case "read":
      return <CheckCheck className="h-3 w-3 text-blue-400" />;
    case "failed":
      return <AlertCircle className="h-3 w-3 text-red-400" />;
    default:
      return <Clock className="h-3 w-3" />;
  }
}

function NewConversationDialog({ 
  onCreated, 
  selectedPhoneNumberId 
}: { 
  onCreated: (id: string) => void;
  selectedPhoneNumberId: string;
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [contactNumber, setContactNumber] = useState("");
  const [contactName, setContactName] = useState("");

  const createMutation = useMutation({
    mutationFn: async (data: { contactNumber: string; contactName: string; phoneNumberId: string }) => {
      const res = await apiRequest("POST", "/api/conversations", data);
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
      toast({
        title: "Contact Added",
        description: "You can now start messaging",
      });
      setOpen(false);
      setContactNumber("");
      setContactName("");
      onCreated(data.id);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to add contact",
        variant: "destructive",
      });
    },
  });

  const handleCreate = () => {
    if (!contactNumber.trim()) return;
    createMutation.mutate({
      contactNumber: contactNumber.trim(),
      contactName: contactName.trim(),
      phoneNumberId: selectedPhoneNumberId,
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" data-testid="button-new-conversation">
          <Plus className="h-4 w-4 mr-1" />
          New
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add New Contact</DialogTitle>
          <DialogDescription>
            Add a new contact to start messaging
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="contactNumber">Phone Number *</Label>
            <Input
              id="contactNumber"
              placeholder="+1 (555) 123-4567"
              value={contactNumber}
              onChange={(e) => setContactNumber(e.target.value)}
              data-testid="input-contact-number"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="contactName">Name (optional)</Label>
            <Input
              id="contactName"
              placeholder="John Doe"
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
              data-testid="input-contact-name"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleCreate}
            disabled={!contactNumber.trim() || createMutation.isPending}
            data-testid="button-create-conversation"
          >
            {createMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : null}
            Add Contact
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditContactDialog({ 
  conversation, 
  open, 
  onOpenChange 
}: { 
  conversation: Conversation; 
  open: boolean; 
  onOpenChange: (open: boolean) => void;
}) {
  const { toast } = useToast();
  const [contactName, setContactName] = useState(conversation.contactName || "");
  const [category, setCategory] = useState(conversation.category || "general");

  useEffect(() => {
    setContactName(conversation.contactName || "");
    setCategory(conversation.category || "general");
  }, [conversation]);

  const updateMutation = useMutation({
    mutationFn: async (data: { contactName: string; category: string }) => {
      return apiRequest("PATCH", `/api/conversations/${conversation.id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
      toast({ title: "Contact Updated", description: "Contact details have been saved." });
      onOpenChange(false);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update contact", variant: "destructive" });
    },
  });

  const handleSave = () => {
    updateMutation.mutate({ contactName: contactName.trim(), category });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Contact</DialogTitle>
          <DialogDescription>Update contact details</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Phone Number</Label>
            <Input value={conversation.contactNumber} disabled />
          </div>
          <div className="space-y-2">
            <Label htmlFor="editName">Name</Label>
            <Input
              id="editName"
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
              placeholder="Contact name"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="editCategory">Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger>
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="general">General</SelectItem>
                <SelectItem value="sales">Sales</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={updateMutation.isPending}>
            {updateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ConversationList({
  conversations,
  selectedId,
  onSelect,
  isLoading,
  onNewConversation,
  selectedPhoneNumberId,
}: {
  conversations: Conversation[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  isLoading: boolean;
  onNewConversation?: (id: string) => void;
  selectedPhoneNumberId: string;
}) {
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("all");
  const [editingConversation, setEditingConversation] = useState<Conversation | null>(null);
  const { toast } = useToast();

  const pinMutation = useMutation({
    mutationFn: async ({ id, isPinned }: { id: string; isPinned: boolean }) => {
      return apiRequest("PATCH", `/api/conversations/${id}`, { isPinned });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/conversations/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
      toast({ title: "Contact Removed", description: "The contact has been removed." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to remove contact", variant: "destructive" });
    },
  });

  const moveMutation = useMutation({
    mutationFn: async ({ id, category }: { id: string; category: string }) => {
      return apiRequest("PATCH", `/api/conversations/${id}`, { category });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
      toast({ title: "Contact Moved", description: "Contact category updated." });
    },
  });

  const filteredConversations = conversations
    .filter((conv) => {
      const matchesSearch =
        conv.contactName?.toLowerCase().includes(search.toLowerCase()) ||
        conv.contactNumber.includes(search);
      
      if (activeTab === "sales") {
        return matchesSearch && conv.category === "sales";
      }
      return matchesSearch;
    })
    .sort((a, b) => {
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      return 0;
    });

  const formatTime = (date: Date | string | null) => {
    if (!date) return "";
    const d = new Date(date);
    if (isToday(d)) return format(d, "h:mm a");
    if (isYesterday(d)) return "Yesterday";
    return format(d, "MMM d");
  };

  const getInitials = (name: string | null, number: string) => {
    if (name) {
      return name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2);
    }
    return number.slice(-2);
  };

  const handleEdit = (conv: Conversation, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingConversation(conv);
  };

  const handlePin = (conv: Conversation, e: React.MouseEvent) => {
    e.stopPropagation();
    pinMutation.mutate({ id: conv.id, isPinned: !conv.isPinned });
  };

  const handleMove = (conv: Conversation, e: React.MouseEvent) => {
    e.stopPropagation();
    const newCategory = conv.category === "sales" ? "general" : "sales";
    moveMutation.mutate({ id: conv.id, category: newCategory });
  };

  const handleRemove = (conv: Conversation, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm(`Remove ${conv.contactName || conv.contactNumber}?`)) {
      deleteMutation.mutate(conv.id);
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col h-full">
        <div className="p-4 border-b">
          <Skeleton className="h-9 w-full" />
        </div>
        <div className="flex-1 p-2 space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex items-center gap-3 p-3">
              <Skeleton className="h-10 w-10 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-3 w-40" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-semibold text-lg">Contacts</h2>
          {onNewConversation && (
            <NewConversationDialog 
              onCreated={onNewConversation} 
              selectedPhoneNumberId={selectedPhoneNumberId}
            />
          )}
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search contacts..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
            data-testid="input-search-conversations"
          />
        </div>
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="w-full grid grid-cols-2">
            <TabsTrigger value="all" data-testid="tab-all-conversations">All</TabsTrigger>
            <TabsTrigger value="sales" data-testid="tab-sales-conversations">Sales</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {filteredConversations.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No contacts found</p>
            </div>
          ) : (
            filteredConversations.map((conv) => (
              <div
                key={conv.id}
                className={`group flex items-center gap-2 p-3 rounded-lg transition-colors hover-elevate cursor-pointer ${
                  selectedId === conv.id ? "bg-accent" : ""
                }`}
                onClick={() => onSelect(conv.id)}
                data-testid={`conversation-${conv.id}`}
              >
                <Avatar className="h-10 w-10 flex-shrink-0">
                  <AvatarFallback className="bg-primary/10 text-primary text-sm">
                    {getInitials(conv.contactName, conv.contactNumber)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0 overflow-hidden">
                  <div className="flex items-center gap-2">
                    {conv.isPinned && (
                      <Pin className="h-3 w-3 text-primary flex-shrink-0" />
                    )}
                    <p className="font-medium truncate flex-1">
                      {conv.contactName || conv.contactNumber}
                    </p>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {formatTime(conv.lastMessageAt)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm text-muted-foreground truncate flex-1">
                      {conv.lastMessagePreview || "No messages yet"}
                    </p>
                    {conv.unreadCount > 0 && (
                      <Badge variant="default" className="h-5 min-w-5 flex items-center justify-center text-xs flex-shrink-0">
                        {conv.unreadCount}
                      </Badge>
                    )}
                  </div>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                      data-testid={`menu-conversation-${conv.id}`}
                    >
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={(e) => handleEdit(conv, e)} data-testid="menu-edit">
                      <Pencil className="mr-2 h-4 w-4" />
                      Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={(e) => handlePin(conv, e)} data-testid="menu-pin">
                      <Pin className={`mr-2 h-4 w-4 ${conv.isPinned ? "text-primary" : ""}`} />
                      {conv.isPinned ? "Unpin" : "Pin"}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={(e) => handleMove(conv, e)} data-testid="menu-move">
                      <FolderInput className="mr-2 h-4 w-4" />
                      Move to {conv.category === "sales" ? "General" : "Sales"}
                    </DropdownMenuItem>
                    <DropdownMenuItem 
                      onClick={(e) => handleRemove(conv, e)} 
                      className="text-destructive focus:text-destructive"
                      data-testid="menu-remove"
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Remove
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ))
          )}
        </div>
      </ScrollArea>
      
      {editingConversation && (
        <EditContactDialog
          conversation={editingConversation}
          open={!!editingConversation}
          onOpenChange={(open) => !open && setEditingConversation(null)}
        />
      )}
    </div>
  );
}

function MessageThread({
  conversationId,
  conversation,
}: {
  conversationId: string;
  conversation: Conversation | undefined;
}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [message, setMessage] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { data: messages = [], isLoading } = useQuery<Message[]>({
    queryKey: ["/api/conversations", conversationId, "messages"],
    enabled: !!conversationId,
  });

  const sendMutation = useMutation({
    mutationFn: async (content: string) => {
      return apiRequest("POST", `/api/conversations/${conversationId}/messages`, { content });
    },
    onSuccess: () => {
      setMessage("");
      queryClient.invalidateQueries({ queryKey: ["/api/conversations", conversationId, "messages"] });
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
    },
    onError: (error) => {
      toast({
        title: "Failed to send message",
        description: error instanceof Error ? error.message : "Please try again",
        variant: "destructive",
      });
    },
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = () => {
    if (!message.trim()) return;
    sendMutation.mutate(message);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const formatMessageTime = (date: Date | string) => {
    return format(new Date(date), "h:mm a");
  };

  const getInitials = (name: string | null, number: string) => {
    if (name) {
      return name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2);
    }
    return number.slice(-2);
  };

  if (isLoading) {
    return (
      <div className="flex flex-col h-full">
        <div className="p-4 border-b flex items-center gap-3">
          <Skeleton className="h-10 w-10 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-24" />
          </div>
        </div>
        <div className="flex-1 p-4 space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className={`flex ${i % 2 === 0 ? "justify-end" : "justify-start"}`}>
              <Skeleton className={`h-16 ${i % 2 === 0 ? "w-48" : "w-56"} rounded-lg`} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Avatar className="h-10 w-10">
            <AvatarFallback className="bg-primary/10 text-primary">
              {conversation ? getInitials(conversation.contactName, conversation.contactNumber) : "?"}
            </AvatarFallback>
          </Avatar>
          <div>
            <p className="font-medium">
              {conversation?.contactName || conversation?.contactNumber || "Unknown"}
            </p>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Phone className="h-3 w-3" />
              {conversation?.contactNumber}
            </div>
          </div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" data-testid="button-conversation-menu">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem data-testid="menu-view-contact">
              <User className="mr-2 h-4 w-4" />
              View Contact
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <ScrollArea className="flex-1 p-4">
        <div className="space-y-4">
          {messages.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No messages yet</p>
              <p className="text-sm">Send a message to start the conversation</p>
            </div>
          ) : (
            messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex ${msg.direction === "outbound" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[70%] rounded-lg p-3 ${
                    msg.direction === "outbound"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted"
                  }`}
                >
                  <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                  <div
                    className={`flex items-center gap-2 mt-1 text-xs ${
                      msg.direction === "outbound"
                        ? "text-primary-foreground/70"
                        : "text-muted-foreground"
                    }`}
                  >
                    <span>{formatMessageTime(msg.createdAt)}</span>
                    {msg.direction === "outbound" && (
                      <MessageStatusIcon status={msg.status} isOutbound={true} />
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      <div className="p-4 border-t">
        <div className="flex gap-2">
          <Input
            placeholder="Type a message..."
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyPress={handleKeyPress}
            disabled={sendMutation.isPending}
            data-testid="input-message"
          />
          <Button
            onClick={handleSend}
            disabled={!message.trim() || sendMutation.isPending}
            data-testid="button-send-message"
          >
            {sendMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

interface PhoneNumberWithUnread extends PhoneNumber {
  unreadCount?: number;
}

// SMS Ringtone options - must match settings pages exactly
const ringtoneOptions: Record<string, string> = {
  "chime": "https://cdn.freesound.org/previews/536/536420_4921277-lq.mp3",
  "bell": "https://cdn.freesound.org/previews/411/411089_5121236-lq.mp3",
  "ding": "https://cdn.freesound.org/previews/320/320655_5260872-lq.mp3",
  "pop": "https://cdn.freesound.org/previews/256/256113_3263906-lq.mp3",
  "bubble": "https://cdn.freesound.org/previews/242/242501_4284968-lq.mp3",
  "swoosh": "https://cdn.freesound.org/previews/527/527847_3905081-lq.mp3",
  "notification": "https://cdn.freesound.org/previews/352/352661_5477037-lq.mp3",
  "alert": "https://cdn.freesound.org/previews/518/518305_11551375-lq.mp3",
  "message": "https://cdn.freesound.org/previews/582/582489_6552523-lq.mp3",
  "ping": "https://cdn.freesound.org/previews/614/614258_6142149-lq.mp3",
  "soft-chime": "https://cdn.freesound.org/previews/523/523651_10896060-lq.mp3",
  "gentle": "https://cdn.freesound.org/previews/447/447912_9159316-lq.mp3",
  "subtle": "https://cdn.freesound.org/previews/254/254819_4062622-lq.mp3",
  "whisper": "https://cdn.freesound.org/previews/131/131657_2398403-lq.mp3",
  "bright": "https://cdn.freesound.org/previews/221/221359_2226942-lq.mp3",
  "cheerful": "https://cdn.freesound.org/previews/335/335908_5865517-lq.mp3",
  "positive": "https://cdn.freesound.org/previews/320/320775_5260872-lq.mp3",
  "success": "https://cdn.freesound.org/previews/270/270304_5123851-lq.mp3",
};

// Track seen message IDs to prevent duplicate notifications
const seenMessageIds = new Set<string>();

function playNotificationSound() {
  try {
    const savedRingtone = localStorage.getItem('sms-ringtone') || 'chime';
    const soundUrl = ringtoneOptions[savedRingtone] || ringtoneOptions['chime'];
    const audio = new Audio(soundUrl);
    audio.volume = 0.6;
    audio.play().catch(() => {});
  } catch (e) {}
}

function requestNotificationPermission() {
  if ("Notification" in window && Notification.permission === "default") {
    Notification.requestPermission();
  }
}

function showBrowserNotification(title: string, body: string, messageId: string) {
  if ("Notification" in window && Notification.permission === "granted") {
    new Notification(title, { body, icon: "/favicon.png", tag: messageId });
  }
}

export default function ConversationsPage() {
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [selectedPhoneNumberId, setSelectedPhoneNumberId] = useState<string | null>(null);
  const { toast } = useToast();

  const handleNewMessage = useCallback((data: any) => {
    const msg = data.message;
    if (msg && msg.direction === "inbound") {
      const messageId = msg.id || msg.signalwireMessageId || `${Date.now()}`;
      
      // Prevent duplicate notifications for same message
      if (seenMessageIds.has(messageId)) {
        return;
      }
      seenMessageIds.add(messageId);
      
      // Keep set size manageable (last 100 messages)
      if (seenMessageIds.size > 100) {
        const firstId = seenMessageIds.values().next().value;
        if (firstId) seenMessageIds.delete(firstId);
      }
      
      playNotificationSound();
      const contactName = msg.senderName || data.conversation?.contactName || data.conversation?.contactNumber || "New Contact";
      const messageContent = msg.content || "";
      showBrowserNotification("New Message", `${contactName}: ${messageContent.substring(0, 50)}`, messageId);
      toast({
        title: "New Message",
        description: `${contactName}: ${messageContent.substring(0, 50)}`,
      });
    }
  }, [toast]);

  const { subscribeToConversation, unsubscribeFromConversation } = useWebSocket({
    onNewMessage: handleNewMessage,
  });

  useEffect(() => {
    requestNotificationPermission();
  }, []);

  // Mutation to mark conversation as read
  const markAsReadMutation = useMutation({
    mutationFn: async (conversationId: string) => {
      await apiRequest("POST", `/api/conversations/${conversationId}/read`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
    },
  });

  useEffect(() => {
    if (selectedConversationId) {
      subscribeToConversation(selectedConversationId);
      // Mark conversation as read when selected
      markAsReadMutation.mutate(selectedConversationId);
      return () => unsubscribeFromConversation(selectedConversationId);
    }
  }, [selectedConversationId, subscribeToConversation, unsubscribeFromConversation]);

  const { data: phoneNumbers = [], isLoading: phoneNumbersLoading } = useQuery<PhoneNumber[]>({
    queryKey: ["/api/phone-numbers"],
  });

  const { data: allConversations = [], isLoading: conversationsLoading } = useQuery<Conversation[]>({
    queryKey: ["/api/conversations"],
  });

  // Calculate unread counts per phone number
  const phoneNumbersWithUnread: PhoneNumberWithUnread[] = phoneNumbers.map((phone) => {
    const unreadCount = allConversations
      .filter((conv) => conv.phoneNumberId === phone.id)
      .reduce((sum, conv) => sum + (conv.unreadCount || 0), 0);
    return { ...phone, unreadCount };
  });

  // Calculate total unread across all phone numbers
  const totalUnreadCount = phoneNumbersWithUnread.reduce((sum, phone) => sum + (phone.unreadCount || 0), 0);

  // Filter conversations by selected phone number and sort by lastMessageAt (newest first)
  const filteredConversations = selectedPhoneNumberId
    ? allConversations
        .filter((conv) => conv.phoneNumberId === selectedPhoneNumberId)
        .sort((a, b) => {
          const aTime = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
          const bTime = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
          return bTime - aTime;
        })
    : [];

  const selectedConversation = allConversations.find((c) => c.id === selectedConversationId);

  // Reset selected conversation when phone number changes
  useEffect(() => {
    setSelectedConversationId(null);
  }, [selectedPhoneNumberId]);

  // Show loading state while phone numbers are loading
  if (phoneNumbersLoading) {
    return (
      <div className="flex h-[calc(100vh-64px)] items-center justify-center">
        <div className="text-center text-muted-foreground">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  // Show message if no phone numbers available
  if (phoneNumbers.length === 0) {
    return (
      <div className="flex h-[calc(100vh-64px)] items-center justify-center">
        <div className="text-center text-muted-foreground max-w-md">
          <Phone className="h-16 w-16 mx-auto mb-4 opacity-50" />
          <p className="text-lg font-medium mb-2">No Phone Numbers</p>
          <p className="text-sm">
            You need to buy phone numbers first before you can start messaging.
            Go to Buy Numbers page to purchase numbers from your connected gateway.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-64px)]">
      {/* Phone Number Selector */}
      <div className="border-b p-4 bg-muted/30">
        <div className="flex items-center gap-3">
          <Label className="text-sm font-medium whitespace-nowrap">Select Number:</Label>
          <div className="relative">
            <Select 
              value={selectedPhoneNumberId || ""} 
              onValueChange={(val) => setSelectedPhoneNumberId(val)}
            >
              <SelectTrigger className="w-[300px]" data-testid="select-phone-number">
                <SelectValue placeholder="Choose a phone number" />
              </SelectTrigger>
            <SelectContent>
              {phoneNumbersWithUnread.map((phone) => (
                <SelectItem key={phone.id} value={phone.id}>
                  <div className="flex items-center gap-2 justify-between w-full">
                    <span>{phone.number}</span>
                    {phone.friendlyName && (
                      <span className="text-muted-foreground text-xs">({phone.friendlyName})</span>
                    )}
                    {(phone.unreadCount ?? 0) > 0 && (
                      <Badge variant="destructive" className="h-5 min-w-5 flex items-center justify-center text-xs ml-2">
                        {phone.unreadCount}
                      </Badge>
                    )}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
            {totalUnreadCount > 0 && (
              <span className="absolute -top-1 -right-1 h-3 w-3 bg-destructive rounded-full animate-pulse" />
            )}
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      {!selectedPhoneNumberId ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center text-muted-foreground max-w-md">
            <Phone className="h-16 w-16 mx-auto mb-4 opacity-50" />
            <p className="text-lg font-medium mb-2">Select a Phone Number</p>
            <p className="text-sm">
              Choose a phone number from the dropdown above to view and manage contacts for that number.
            </p>
          </div>
        </div>
      ) : (
        <div className="flex flex-1 overflow-hidden">
          <Card className="w-80 flex-shrink-0 rounded-none border-y-0 border-l-0">
            <ConversationList
              conversations={filteredConversations}
              selectedId={selectedConversationId}
              onSelect={setSelectedConversationId}
              isLoading={conversationsLoading}
              onNewConversation={setSelectedConversationId}
              selectedPhoneNumberId={selectedPhoneNumberId}
            />
          </Card>
          <div className="flex-1 bg-background">
            {selectedConversationId ? (
              <MessageThread
                conversationId={selectedConversationId}
                conversation={selectedConversation}
              />
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                <MessageSquare className="h-16 w-16 mb-4 opacity-50" />
                <p className="text-lg font-medium">Select a contact</p>
                <p className="text-sm">Choose a contact from the list to start messaging</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
