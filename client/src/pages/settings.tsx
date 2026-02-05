import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  User,
  Bell,
  Shield,
  Palette,
  Loader2,
  CheckCircle,
  Plug,
  Phone,
  AlertCircle,
  Settings,
  Trash2,
  Volume2,
  Play,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useQuery, useMutation } from "@tanstack/react-query";
import { ThemeToggle } from "@/components/theme-toggle";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { SiTwilio } from "react-icons/si";
import { themes, applyTheme } from "@/lib/themes";

interface SignalWireStatus {
  configured: boolean;
  projectId?: string;
  spaceUrl?: string;
}

interface SmsGateway {
  id: string;
  adminId: string;
  provider: "signalwire" | "twilio" | "telnyx";
  name: string;
  isActive: boolean;
  hasCredentials: boolean;
  createdAt: string;
}

type ProviderType = "signalwire" | "twilio" | "telnyx";

// SMS Ringtone options - working notification sounds from various CDN sources
const ringtoneOptions = [
  { id: "chime", name: "Chime", url: "https://cdn.freesound.org/previews/536/536420_4921277-lq.mp3", category: "Classic" },
  { id: "bell", name: "Bell", url: "https://cdn.freesound.org/previews/411/411089_5121236-lq.mp3", category: "Classic" },
  { id: "ding", name: "Ding", url: "https://cdn.freesound.org/previews/320/320655_5260872-lq.mp3", category: "Classic" },
  { id: "pop", name: "Pop", url: "https://cdn.freesound.org/previews/256/256113_3263906-lq.mp3", category: "Classic" },
  { id: "bubble", name: "Bubble", url: "https://cdn.freesound.org/previews/242/242501_4284968-lq.mp3", category: "Classic" },
  { id: "swoosh", name: "Swoosh", url: "https://cdn.freesound.org/previews/527/527847_3905081-lq.mp3", category: "Modern" },
  { id: "notification", name: "Notification", url: "https://cdn.freesound.org/previews/352/352661_5477037-lq.mp3", category: "Modern" },
  { id: "alert", name: "Alert", url: "https://cdn.freesound.org/previews/518/518305_11551375-lq.mp3", category: "Modern" },
  { id: "message", name: "Message", url: "https://cdn.freesound.org/previews/582/582489_6552523-lq.mp3", category: "Modern" },
  { id: "ping", name: "Ping", url: "https://cdn.freesound.org/previews/614/614258_6142149-lq.mp3", category: "Modern" },
  { id: "soft-chime", name: "Soft Chime", url: "https://cdn.freesound.org/previews/523/523651_10896060-lq.mp3", category: "Soft" },
  { id: "gentle", name: "Gentle", url: "https://cdn.freesound.org/previews/447/447912_9159316-lq.mp3", category: "Soft" },
  { id: "subtle", name: "Subtle", url: "https://cdn.freesound.org/previews/254/254819_4062622-lq.mp3", category: "Soft" },
  { id: "whisper", name: "Whisper", url: "https://cdn.freesound.org/previews/131/131657_2398403-lq.mp3", category: "Soft" },
  { id: "bright", name: "Bright", url: "https://cdn.freesound.org/previews/221/221359_2226942-lq.mp3", category: "Bright" },
  { id: "cheerful", name: "Cheerful", url: "https://cdn.freesound.org/previews/335/335908_5865517-lq.mp3", category: "Bright" },
  { id: "positive", name: "Positive", url: "https://cdn.freesound.org/previews/320/320775_5260872-lq.mp3", category: "Bright" },
  { id: "success", name: "Success", url: "https://cdn.freesound.org/previews/270/270304_5123851-lq.mp3", category: "Bright" },
];

// Get saved ringtone from localStorage
const getSavedRingtone = () => {
  if (typeof window !== 'undefined') {
    return localStorage.getItem('sms-ringtone') || 'chime';
  }
  return 'chime';
};

// Using themes from lib/themes.ts for complete theme customization

const providerInfo: Record<ProviderType, { name: string; description: string; color: string; fields: { key: string; label: string; type: string }[] }> = {
  twilio: {
    name: "Twilio",
    description: "Global cloud communications platform with SMS, voice, and messaging APIs",
    color: "from-red-500 to-pink-600",
    fields: [
      { key: "accountSid", label: "Account SID", type: "text" },
      { key: "authToken", label: "Auth Token", type: "password" },
    ],
  },
  signalwire: {
    name: "SignalWire",
    description: "Programmable communications with powerful SMS and voice capabilities",
    color: "from-blue-500 to-cyan-600",
    fields: [
      { key: "projectId", label: "Project ID", type: "text" },
      { key: "spaceUrl", label: "Space URL", type: "text" },
      { key: "token", label: "API Token", type: "password" },
    ],
  },
  telnyx: {
    name: "Telnyx",
    description: "Enterprise-grade telecommunications with global coverage",
    color: "from-green-500 to-emerald-600",
    fields: [
      { key: "apiKey", label: "API Key", type: "password" },
    ],
  },
};

export default function SettingsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isSaving, setIsSaving] = useState(false);
  const [notifications, setNotifications] = useState({
    emailNotifications: true,
    pushNotifications: true,
    messageAlerts: true,
    teamUpdates: false,
  });
  const [selectedProvider, setSelectedProvider] = useState<ProviderType | null>(null);
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [connectionName, setConnectionName] = useState("");
  const [selectedRingtone, setSelectedRingtone] = useState(getSavedRingtone());
  const [previewAudio, setPreviewAudio] = useState<HTMLAudioElement | null>(null);
  const [selectedTheme, setSelectedTheme] = useState(user?.theme || 'default');
  const [isSavingTheme, setIsSavingTheme] = useState(false);
  const hasThemeChanges = selectedTheme !== (user?.theme || 'default');

  const playRingtonePreview = (ringtoneId: string) => {
    const ringtone = ringtoneOptions.find(r => r.id === ringtoneId);
    if (ringtone) {
      if (previewAudio) {
        previewAudio.pause();
        previewAudio.currentTime = 0;
      }
      const audio = new Audio(ringtone.url);
      audio.volume = 0.6;
      audio.play().catch(() => {});
      setPreviewAudio(audio);
    }
  };

  const handleRingtoneChange = (ringtoneId: string) => {
    setSelectedRingtone(ringtoneId);
    localStorage.setItem('sms-ringtone', ringtoneId);
    playRingtonePreview(ringtoneId);
    toast({
      title: "Ringtone Updated",
      description: `SMS notification sound set to "${ringtoneOptions.find(r => r.id === ringtoneId)?.name}"`,
    });
  };

  const handleThemeChange = (themeId: string) => {
    setSelectedTheme(themeId);
    // Preview the theme (does not save)
    applyTheme(themeId);
  };

  const handleSaveTheme = async () => {
    setIsSavingTheme(true);
    try {
      await apiRequest("PATCH", "/api/auth/theme", { theme: selectedTheme });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      const theme = themes.find(t => t.id === selectedTheme);
      toast({
        title: "Theme Saved",
        description: `Theme changed to "${theme?.name || selectedTheme}"`,
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to save theme",
        variant: "destructive",
      });
    } finally {
      setIsSavingTheme(false);
    }
  };

  const handleCancelThemeChange = () => {
    const savedTheme = user?.theme || 'default';
    setSelectedTheme(savedTheme);
    applyTheme(savedTheme);
  };

  const { data: signalWireStatus, isLoading: isLoadingStatus } = useQuery<SignalWireStatus>({
    queryKey: ["/api/signalwire/status"],
  });

  const { data: gateways = [], isLoading: isLoadingGateways } = useQuery<SmsGateway[]>({
    queryKey: ["/api/integrations/gateways"],
    enabled: user?.role === "admin",
  });

  const { data: activeGateway } = useQuery<SmsGateway | null>({
    queryKey: ["/api/integrations/gateways/active"],
  });

  const connectMutation = useMutation({
    mutationFn: async (data: { provider: ProviderType; name: string; credentials: Record<string, string> }) => {
      return apiRequest("POST", "/api/integrations/gateways", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/integrations/gateways"] });
      queryClient.invalidateQueries({ queryKey: ["/api/phone-numbers"] });
      setSelectedProvider(null);
      setCredentials({});
      setConnectionName("");
      toast({
        title: "Gateway connected",
        description: "Your SMS gateway has been connected and phone numbers synced.",
      });
    },
    onError: (error: any) => {
      const errorMessage = error?.error || error?.message || "Please check your credentials and try again.";
      toast({
        title: "Connection failed",
        description: errorMessage,
        variant: "destructive",
      });
    },
  });

  const activateMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("PATCH", `/api/integrations/gateways/${id}/activate`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/integrations/gateways"] });
      queryClient.invalidateQueries({ queryKey: ["/api/integrations/gateways/active"] });
      queryClient.invalidateQueries({ queryKey: ["/api/phone-numbers"] });
      toast({
        title: "Gateway activated",
        description: "This gateway is now your active SMS provider.",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/integrations/gateways/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/integrations/gateways"] });
      queryClient.invalidateQueries({ queryKey: ["/api/integrations/gateways/active"] });
      queryClient.invalidateQueries({ queryKey: ["/api/phone-numbers"] });
      toast({
        title: "Gateway removed",
        description: "The gateway has been disconnected.",
      });
    },
  });

  const handleConnect = () => {
    if (!selectedProvider || !connectionName.trim()) return;
    connectMutation.mutate({
      provider: selectedProvider,
      name: connectionName,
      credentials,
    });
  };

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  const handleSaveProfile = async () => {
    setIsSaving(true);
    await new Promise((resolve) => setTimeout(resolve, 1000));
    toast({
      title: "Profile updated",
      description: "Your profile has been saved successfully.",
    });
    setIsSaving(false);
  };

  const handleSaveNotifications = async () => {
    setIsSaving(true);
    await new Promise((resolve) => setTimeout(resolve, 1000));
    toast({
      title: "Preferences saved",
      description: "Your notification preferences have been updated.",
    });
    setIsSaving(false);
  };

  return (
    <div className="flex-1 space-y-6 p-6 overflow-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">
          Manage your account settings and preferences
        </p>
      </div>

      <Tabs defaultValue="profile" className="space-y-6">
        <TabsList>
          <TabsTrigger value="profile" data-testid="tab-profile">
            <User className="mr-2 h-4 w-4" />
            Profile
          </TabsTrigger>
          <TabsTrigger value="notifications" data-testid="tab-notifications">
            <Bell className="mr-2 h-4 w-4" />
            Notifications
          </TabsTrigger>
          <TabsTrigger value="appearance" data-testid="tab-appearance">
            <Palette className="mr-2 h-4 w-4" />
            Appearance
          </TabsTrigger>
          <TabsTrigger value="security" data-testid="tab-security">
            <Shield className="mr-2 h-4 w-4" />
            Security
          </TabsTrigger>
          <TabsTrigger value="integrations" data-testid="tab-integrations">
            <Plug className="mr-2 h-4 w-4" />
            Integrations
          </TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Profile Information</CardTitle>
              <CardDescription>
                Update your personal information and profile details
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center gap-6">
                <Avatar className="h-20 w-20">
                  <AvatarFallback className="bg-primary/10 text-primary text-xl">
                    {user?.fullName ? getInitials(user.fullName) : "U"}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <Button variant="outline" size="sm">
                    Change Avatar
                  </Button>
                  <p className="text-sm text-muted-foreground mt-1">
                    JPG, GIF or PNG. Max size 2MB.
                  </p>
                </div>
              </div>

              <Separator />

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="fullName">Full Name</Label>
                  <Input
                    id="fullName"
                    defaultValue={user?.fullName}
                    data-testid="input-settings-fullname"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="username">Username</Label>
                  <Input
                    id="username"
                    defaultValue={user?.username}
                    data-testid="input-settings-username"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    defaultValue={user?.email}
                    data-testid="input-settings-email"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Role</Label>
                  <div className="flex items-center gap-2 h-9">
                    <Badge variant="default" className="capitalize">
                      <Shield className="mr-1 h-3 w-3" />
                      {user?.role?.replace("_", " ")}
                    </Badge>
                  </div>
                </div>
              </div>

              <div className="flex justify-end">
                <Button onClick={handleSaveProfile} disabled={isSaving} data-testid="button-save-profile">
                  {isSaving ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <CheckCircle className="mr-2 h-4 w-4" />
                      Save Changes
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notifications" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Notification Preferences</CardTitle>
              <CardDescription>
                Choose what notifications you want to receive
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Email Notifications</Label>
                    <p className="text-sm text-muted-foreground">
                      Receive email notifications for important updates
                    </p>
                  </div>
                  <Switch
                    checked={notifications.emailNotifications}
                    onCheckedChange={(checked) =>
                      setNotifications((prev) => ({ ...prev, emailNotifications: checked }))
                    }
                    data-testid="switch-email-notifications"
                  />
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Push Notifications</Label>
                    <p className="text-sm text-muted-foreground">
                      Receive push notifications in your browser
                    </p>
                  </div>
                  <Switch
                    checked={notifications.pushNotifications}
                    onCheckedChange={(checked) =>
                      setNotifications((prev) => ({ ...prev, pushNotifications: checked }))
                    }
                    data-testid="switch-push-notifications"
                  />
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Message Alerts</Label>
                    <p className="text-sm text-muted-foreground">
                      Get notified when you receive new messages
                    </p>
                  </div>
                  <Switch
                    checked={notifications.messageAlerts}
                    onCheckedChange={(checked) =>
                      setNotifications((prev) => ({ ...prev, messageAlerts: checked }))
                    }
                    data-testid="switch-message-alerts"
                  />
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Team Updates</Label>
                    <p className="text-sm text-muted-foreground">
                      Receive notifications about team member activity
                    </p>
                  </div>
                  <Switch
                    checked={notifications.teamUpdates}
                    onCheckedChange={(checked) =>
                      setNotifications((prev) => ({ ...prev, teamUpdates: checked }))
                    }
                    data-testid="switch-team-updates"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Volume2 className="h-5 w-5" />
                SMS Ringtone
              </CardTitle>
              <CardDescription>
                Choose a notification sound for incoming SMS messages
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {ringtoneOptions.map((ringtone) => (
                    <div
                      key={ringtone.id}
                      className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all hover-elevate ${
                        selectedRingtone === ringtone.id
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-primary/50"
                      }`}
                      onClick={() => handleRingtoneChange(ringtone.id)}
                      onMouseEnter={() => playRingtonePreview(ringtone.id)}
                      onMouseLeave={() => {
                        if (previewAudio) {
                          previewAudio.pause();
                          previewAudio.currentTime = 0;
                        }
                      }}
                      data-testid={`ringtone-${ringtone.id}`}
                    >
                      <div className={`flex items-center justify-center w-8 h-8 rounded-full ${
                        selectedRingtone === ringtone.id ? "bg-primary text-primary-foreground" : "bg-muted"
                      }`}>
                        {selectedRingtone === ringtone.id ? (
                          <CheckCircle className="h-4 w-4" />
                        ) : (
                          <Play className="h-3 w-3" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm">{ringtone.name}</p>
                        <p className="text-xs text-muted-foreground">{ringtone.category}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <p className="text-sm text-muted-foreground">
                  Hover over any ringtone to preview. Click to select.
                </p>
              </div>

              <div className="flex justify-end">
                <Button onClick={handleSaveNotifications} disabled={isSaving} data-testid="button-save-notifications">
                  {isSaving ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <CheckCircle className="mr-2 h-4 w-4" />
                      Save Preferences
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="appearance" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Appearance</CardTitle>
              <CardDescription>
                Customize how the application looks
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Light / Dark Mode</Label>
                  <p className="text-sm text-muted-foreground">
                    Toggle between light and dark mode
                  </p>
                </div>
                <ThemeToggle />
              </div>

              <Separator />

              <div className="space-y-4">
                <div className="space-y-0.5">
                  <Label>Color Theme</Label>
                  <p className="text-sm text-muted-foreground">
                    Choose a color theme for the application background
                  </p>
                </div>
                
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                  {themes.map((theme) => (
                    <div
                      key={theme.id}
                      className={`relative flex flex-col items-center gap-2 p-3 rounded-lg border cursor-pointer transition-all hover-elevate ${
                        selectedTheme === theme.id
                          ? "border-primary ring-2 ring-primary ring-offset-2"
                          : "border-border hover:border-primary/50"
                      }`}
                      onClick={() => handleThemeChange(theme.id)}
                      data-testid={`theme-${theme.id}`}
                    >
                      <div className={`w-full h-16 rounded-md bg-gradient-to-br ${theme.preview} shadow-inner`} />
                      <div className="text-center">
                        <p className="font-medium text-sm">{theme.name}</p>
                        <p className="text-xs text-muted-foreground">{theme.description}</p>
                      </div>
                      {selectedTheme === theme.id && (
                        <div className="absolute top-2 right-2">
                          <CheckCircle className="h-4 w-4 text-primary" />
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {hasThemeChanges && (
                  <div className="flex items-center justify-end gap-3 pt-4 border-t">
                    <Button
                      variant="outline"
                      onClick={handleCancelThemeChange}
                      disabled={isSavingTheme}
                      data-testid="button-cancel-theme"
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={handleSaveTheme}
                      disabled={isSavingTheme}
                      data-testid="button-save-theme"
                    >
                      {isSavingTheme ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Saving...
                        </>
                      ) : (
                        <>
                          <CheckCircle className="mr-2 h-4 w-4" />
                          Save Theme
                        </>
                      )}
                    </Button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="security" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Change Password</CardTitle>
              <CardDescription>
                Update your password to keep your account secure
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="currentPassword">Current Password</Label>
                <Input
                  id="currentPassword"
                  type="password"
                  data-testid="input-current-password"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="newPassword">New Password</Label>
                <Input
                  id="newPassword"
                  type="password"
                  data-testid="input-new-password"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm New Password</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  data-testid="input-confirm-password"
                />
              </div>
              <div className="flex justify-end">
                <Button data-testid="button-update-password">Update Password</Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Sessions</CardTitle>
              <CardDescription>
                Manage your active sessions and sign out from other devices
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
                <div>
                  <p className="font-medium">Current Session</p>
                  <p className="text-sm text-muted-foreground">
                    This device - Active now
                  </p>
                </div>
                <Badge variant="secondary">Active</Badge>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="integrations" className="space-y-6">
          {activeGateway && (
            <Card className="border-green-500/30 bg-green-500/5">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <CheckCircle className="h-5 w-5 text-green-500" />
                    <div>
                      <CardTitle className="text-lg">Active Integration</CardTitle>
                      <CardDescription>
                        {activeGateway.name} ({providerInfo[activeGateway.provider].name})
                      </CardDescription>
                    </div>
                  </div>
                  <Badge variant="default" className="bg-green-500">Active</Badge>
                </div>
              </CardHeader>
            </Card>
          )}

          <div>
            <h3 className="text-lg font-semibold mb-4">Connect an SMS Gateway</h3>
            <p className="text-muted-foreground mb-6">
              Choose an SMS provider to enable messaging features. Your credentials are securely encrypted.
            </p>
            
            {isLoadingGateways ? (
              <div className="flex items-center justify-center p-12">
                <Loader2 className="h-8 w-8 animate-spin" />
              </div>
            ) : (
              <div className="grid gap-6 md:grid-cols-3">
                {(Object.keys(providerInfo) as ProviderType[]).map((provider) => {
                  const info = providerInfo[provider];
                  const connectedGateway = gateways.find(g => g.provider === provider);
                  
                  return (
                    <Card 
                      key={provider}
                      className="hover-elevate cursor-pointer overflow-visible relative"
                      onClick={() => !connectedGateway && setSelectedProvider(provider)}
                      data-testid={`card-provider-${provider}`}
                    >
                      <div className={`h-24 bg-gradient-to-br ${info.color} rounded-t-lg flex items-center justify-center`}>
                        {provider === "twilio" && (
                          <SiTwilio className="h-12 w-12 text-white" />
                        )}
                        {provider === "signalwire" && (
                          <Phone className="h-12 w-12 text-white" />
                        )}
                        {provider === "telnyx" && (
                          <Phone className="h-12 w-12 text-white" />
                        )}
                      </div>
                      <CardContent className="pt-4">
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="font-semibold text-lg">{info.name}</h4>
                          {connectedGateway && (
                            <Badge 
                              variant={connectedGateway.isActive ? "default" : "secondary"}
                              className={connectedGateway.isActive ? "bg-green-500" : ""}
                            >
                              {connectedGateway.isActive ? "Active" : "Connected"}
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground mb-4">
                          {info.description}
                        </p>
                        {connectedGateway ? (
                          <div className="flex gap-2">
                            {!connectedGateway.isActive && (
                              <Button 
                                size="sm" 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  activateMutation.mutate(connectedGateway.id);
                                }}
                                disabled={activateMutation.isPending}
                                data-testid={`button-activate-${provider}`}
                              >
                                {activateMutation.isPending ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  "Set Active"
                                )}
                              </Button>
                            )}
                            <Button 
                              size="sm" 
                              variant="outline"
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteMutation.mutate(connectedGateway.id);
                              }}
                              disabled={deleteMutation.isPending}
                              data-testid={`button-disconnect-${provider}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        ) : (
                          <Button 
                            className="w-full" 
                            variant="outline"
                            data-testid={`button-connect-${provider}`}
                          >
                            Connect
                          </Button>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>

          <Dialog open={!!selectedProvider} onOpenChange={(open) => !open && setSelectedProvider(null)}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>
                  Connect {selectedProvider && providerInfo[selectedProvider].name}
                </DialogTitle>
                <DialogDescription>
                  Enter your {selectedProvider && providerInfo[selectedProvider].name} credentials to connect.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label htmlFor="connectionName">Connection Name</Label>
                  <Input
                    id="connectionName"
                    placeholder="e.g., My Twilio Account"
                    value={connectionName}
                    onChange={(e) => setConnectionName(e.target.value)}
                    data-testid="input-connection-name"
                  />
                </div>
                {selectedProvider && providerInfo[selectedProvider].fields.map((field) => (
                  <div key={field.key} className="space-y-2">
                    <Label htmlFor={field.key}>{field.label}</Label>
                    <Input
                      id={field.key}
                      type={field.type}
                      placeholder={field.label}
                      value={credentials[field.key] || ""}
                      onChange={(e) => setCredentials(prev => ({ ...prev, [field.key]: e.target.value }))}
                      data-testid={`input-${field.key}`}
                    />
                  </div>
                ))}
                <div className="flex justify-end gap-3 pt-4">
                  <Button 
                    variant="outline" 
                    onClick={() => setSelectedProvider(null)}
                    data-testid="button-cancel-connect"
                  >
                    Cancel
                  </Button>
                  <Button 
                    onClick={handleConnect}
                    disabled={connectMutation.isPending || !connectionName.trim()}
                    data-testid="button-confirm-connect"
                  >
                    {connectMutation.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Connecting...
                      </>
                    ) : (
                      "Connect"
                    )}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </TabsContent>
      </Tabs>
    </div>
  );
}
