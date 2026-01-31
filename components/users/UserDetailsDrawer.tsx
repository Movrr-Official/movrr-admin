"use client";

import React, { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { X, Mail, Phone, Calendar, Clock, Shield, UserCheck, UserX, Building2, Bike, Edit, KeyRound, Save, Loader2, Download, Route, Megaphone, Gift, Coins, FileText, History } from "lucide-react";
import { format } from "date-fns";

import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { User, userRoleSchema, userStatusSchema } from "@/schemas";
import { CopyButton } from "@/components/CopyButton";
import { useToast } from "@/hooks/useToast";
import { updateUser, sendPasswordResetEmail, exportUserData, getUserActivityLogs, getUserRoutes, getUserCampaigns, getUserRewardTransactions, getUserPointsBalance } from "@/app/actions/users";
import { exportToJSON } from "@/lib/export";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const editUserSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Invalid email address"),
  phone: z.string().optional(),
  role: userRoleSchema,
  status: userStatusSchema,
  organization: z.string().optional(),
  languagePreference: z.string().default("en"),
  isVerified: z.boolean().default(false),
  accountNotes: z.string().optional(),
});

type EditUserFormData = z.infer<typeof editUserSchema>;

interface UserDetailsDrawerProps {
  user: User | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUserUpdate?: () => void;
}

export function UserDetailsDrawer({
  user,
  open,
  onOpenChange,
  onUserUpdate,
}: UserDetailsDrawerProps) {
  const { toast } = useToast();
  const [isEditMode, setIsEditMode] = useState(false);
  const [showResetPasswordConfirmation, setShowResetPasswordConfirmation] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isResettingPassword, setIsResettingPassword] = useState(false);
  const [isExportingData, setIsExportingData] = useState(false);
  const [activityLogs, setActivityLogs] = useState<any[]>([]);
  const [routes, setRoutes] = useState<any[]>([]);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [rewardTransactions, setRewardTransactions] = useState<any[]>([]);
  const [pointsBalance, setPointsBalance] = useState<any>(null);
  const [isLoadingAdditionalData, setIsLoadingAdditionalData] = useState(false);

  const form = useForm<EditUserFormData>({
    resolver: zodResolver(editUserSchema),
    defaultValues: {
      name: "",
      email: "",
      phone: "",
      role: "rider",
      status: "active",
      organization: "",
      languagePreference: "en",
      isVerified: false,
      accountNotes: "",
    },
  });

  // Reset form when user changes or edit mode is enabled
  useEffect(() => {
    if (user && isEditMode) {
      form.reset({
        name: user.name,
        email: user.email,
        phone: user.phone || "",
        role: user.role,
        status: user.status,
        organization: user.organization || "",
        languagePreference: user.languagePreference || "en",
        isVerified: user.isVerified,
        accountNotes: user.accountNotes || "",
      });
    }
  }, [user, isEditMode, form]);

  // Reset edit mode and reset password confirmation when drawer closes
  useEffect(() => {
    if (!open) {
      setIsEditMode(false);
      setShowResetPasswordConfirmation(false);
    }
  }, [open]);

  const handleSave = async (data: EditUserFormData) => {
    if (!user) return;

    setIsLoading(true);
    try {
      const result = await updateUser({
        id: user.id,
        ...data,
      });

      if (!result.success) {
        throw new Error(result.error || "Failed to update user");
      }

      toast({
        title: "User Updated",
        description: `${data.name}'s profile has been updated successfully.`,
      });

      onUserUpdate?.();
      setIsEditMode(false);
    } catch (error) {
      toast({
        title: "Update Failed",
        description:
          error instanceof Error
            ? error.message
            : "Failed to update user. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancel = () => {
    form.reset();
    setIsEditMode(false);
  };

  const handleResetPassword = async () => {
    if (!user) return;

    setIsResettingPassword(true);
    try {
      const result = await sendPasswordResetEmail(user.email);

      if (!result.success) {
        throw new Error(result.error || "Failed to send password reset email");
      }

      toast({
        title: "Password Reset Email Sent",
        description: `A password reset link has been sent to ${user.email}. The user can use it to set a new password.`,
      });

      setShowResetPasswordConfirmation(false);
    } catch (error) {
      toast({
        title: "Reset Failed",
        description:
          error instanceof Error
            ? error.message
            : "Failed to send password reset email. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsResettingPassword(false);
    }
  };

  const handleExportUserData = async () => {
    if (!user) return;

    setIsExportingData(true);
    try {
      const result = await exportUserData(user.id);

      if (!result.success || !result.data) {
        throw new Error(result.error || "Failed to export user data");
      }

      // Export as JSON file
      exportToJSON([result.data], {
        filename: `user_data_${user.id}_${new Date().toISOString().split("T")[0]}`,
        format: "json",
      });

      toast({
        title: "Export Complete",
        description: `User data for ${user.name} has been exported successfully.`,
      });
    } catch (error) {
      toast({
        title: "Export Failed",
        description:
          error instanceof Error
            ? error.message
            : "Failed to export user data. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsExportingData(false);
    }
  };

  if (!user) return null;

  const getRoleBadge = (role: string) => {
    switch (role) {
      case "admin":
      case "super-admin":
        return (
          <Badge className="bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300">
            <Shield className="h-3 w-3 mr-1" />
            {role === "super-admin" ? "Super Admin" : "Admin"}
          </Badge>
        );
      case "advertiser":
        return (
          <Badge className="bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300">
            <Building2 className="h-3 w-3 mr-1" />
            Advertiser
          </Badge>
        );
      case "rider":
        return (
          <Badge className="bg-primary/10 text-primary border-primary/20">
            <Bike className="h-3 w-3 mr-1" />
            Rider
          </Badge>
        );
      default:
        return <Badge variant="secondary">{role}</Badge>;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active":
        return (
          <Badge className="bg-green-100 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300">
            <UserCheck className="h-3 w-3 mr-1" />
            Active
          </Badge>
        );
      case "inactive":
        return (
          <Badge className="bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300">
            <UserX className="h-3 w-3 mr-1" />
            Inactive
          </Badge>
        );
      case "pending":
        return (
          <Badge className="bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300">
            <Clock className="h-3 w-3 mr-1" />
            Pending
          </Badge>
        );
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  return (
    <Drawer direction="right" open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="w-full sm:w-[320px] lg:max-w-[55rem]!  p-0 h-full">
        <div className="h-full flex flex-col bg-gradient-to-b from-background/50 to-background">
          <DrawerHeader className="px-6 py-4 border-b glass-card border-0">
            <div className="flex items-center justify-between">
              <DrawerTitle className="text-2xl font-bold">User Details</DrawerTitle>
              <DrawerClose className="rounded-full h-8 w-8 flex items-center justify-center hover:bg-muted transition-colors">
                <X className="h-4 w-4" />
                <span className="sr-only">Close</span>
              </DrawerClose>
            </div>
          </DrawerHeader>

          <div className="flex-1 overflow-auto px-6 py-6 space-y-6">
            {/* User Header */}
            <div className="flex items-start gap-4">
              <Avatar className="h-20 w-20">
                <AvatarImage src={user.avatarUrl} alt={user.name} />
                <AvatarFallback className="bg-primary text-primary-foreground text-xl font-bold">
                  {user.name
                    .split(" ")
                    .map((n) => n[0])
                    .join("")
                    .toUpperCase()
                    .slice(0, 2)}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1">
                {isEditMode ? (
                  <Form {...form}>
                    <form onSubmit={form.handleSubmit(handleSave)} className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField
                          control={form.control}
                          name="name"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-sm font-semibold">Full Name *</FormLabel>
                              <FormControl>
                                <Input
                                  placeholder="John Doe"
                                  className="rounded-xl border-border/50 bg-background/60 backdrop-blur-sm"
                                  {...field}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="email"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-sm font-semibold">Email *</FormLabel>
                              <FormControl>
                                <Input
                                  type="email"
                                  placeholder="user@example.com"
                                  className="rounded-xl border-border/50 bg-background/60 backdrop-blur-sm"
                                  {...field}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="phone"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-sm font-semibold">Phone</FormLabel>
                              <FormControl>
                                <Input
                                  type="tel"
                                  placeholder="+1 (555) 123-4567"
                                  className="rounded-xl border-border/50 bg-background/60 backdrop-blur-sm"
                                  {...field}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="organization"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-sm font-semibold">Organization</FormLabel>
                              <FormControl>
                                <Input
                                  placeholder="Company Name"
                                  className="rounded-xl border-border/50 bg-background/60 backdrop-blur-sm"
                                  {...field}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="role"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-sm font-semibold">Role *</FormLabel>
                              <Select
                                onValueChange={field.onChange}
                                value={field.value}
                              >
                                <FormControl>
                                  <SelectTrigger className="rounded-xl border-border/50 bg-background/60 backdrop-blur-sm">
                                    <SelectValue placeholder="Select role" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="rider">Rider</SelectItem>
                                  <SelectItem value="advertiser">Advertiser</SelectItem>
                                  <SelectItem value="admin">Admin</SelectItem>
                                  <SelectItem value="super-admin">Super Admin</SelectItem>
                                  <SelectItem value="moderator">Moderator</SelectItem>
                                  <SelectItem value="support">Support</SelectItem>
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="status"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-sm font-semibold">Status *</FormLabel>
                              <Select
                                onValueChange={field.onChange}
                                value={field.value}
                              >
                                <FormControl>
                                  <SelectTrigger className="rounded-xl border-border/50 bg-background/60 backdrop-blur-sm">
                                    <SelectValue placeholder="Select status" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="active">Active</SelectItem>
                                  <SelectItem value="inactive">Inactive</SelectItem>
                                  <SelectItem value="pending">Pending</SelectItem>
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="languagePreference"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-sm font-semibold">Language Preference</FormLabel>
                              <Select
                                onValueChange={field.onChange}
                                value={field.value}
                              >
                                <FormControl>
                                  <SelectTrigger className="rounded-xl border-border/50 bg-background/60 backdrop-blur-sm">
                                    <SelectValue placeholder="Select language" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="en">English</SelectItem>
                                  <SelectItem value="nl">Dutch</SelectItem>
                                  <SelectItem value="es">Spanish</SelectItem>
                                  <SelectItem value="fr">French</SelectItem>
                                  <SelectItem value="de">German</SelectItem>
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="isVerified"
                          render={({ field }) => (
                            <FormItem className="flex flex-row items-center justify-between rounded-xl border border-border/50 bg-background/60 backdrop-blur-sm p-4">
                              <div className="space-y-0.5">
                                <FormLabel className="text-sm font-semibold">Verified Account</FormLabel>
                                <p className="text-xs text-muted-foreground">Mark account as verified</p>
                              </div>
                              <FormControl>
                                <Switch
                                  checked={field.value}
                                  onCheckedChange={field.onChange}
                                />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                      </div>
                      <FormField
                        control={form.control}
                        name="accountNotes"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-sm font-semibold">Account Notes</FormLabel>
                            <FormControl>
                              <Textarea
                                placeholder="Add internal notes about this user..."
                                className="rounded-xl border-border/50 bg-background/60 backdrop-blur-sm min-h-[100px] resize-none"
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </form>
                  </Form>
                ) : (
                  <>
                    <div className="flex items-center gap-3 mb-2">
                      <h2 className="text-2xl font-bold text-foreground">{user.name}</h2>
                      {user.isVerified && (
                        <Badge className="bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300">
                          Verified
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mb-3">
                      {getRoleBadge(user.role)}
                      {getStatusBadge(user.status)}
                    </div>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <Mail className="h-4 w-4" />
                        <a
                          href={`mailto:${user.email}`}
                          className="hover:text-primary transition-colors"
                        >
                          {user.email}
                        </a>
                      </div>
                      {user.phone && (
                        <div className="flex items-center gap-1">
                          <Phone className="h-4 w-4" />
                          {user.phone}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>

            <Separator />

            {/* Basic Information */}
            {!isEditMode && (
              <Card className="glass-card border-0">
                <CardHeader className="pb-4">
                  <CardTitle className="text-lg font-bold">Basic Information</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground mb-1">User ID</p>
                      <div className="flex items-center gap-2">
                        <code className="text-sm font-mono bg-muted px-2 py-1 rounded">
                          {user.id}
                        </code>
                        <CopyButton value={user.id} />
                      </div>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground mb-1">Organization</p>
                      <p className="text-sm font-medium text-foreground">
                        {user.organization || "—"}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground mb-1">Language</p>
                      <p className="text-sm font-medium text-foreground uppercase">
                        {user.languagePreference || "en"}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground mb-1">Verified</p>
                      <p className="text-sm font-medium text-foreground">
                        {user.isVerified ? "Yes" : "No"}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Account Activity */}
            <Card className="glass-card border-0">
              <CardHeader className="pb-4">
                <CardTitle className="text-lg font-bold">Account Activity</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Joined</p>
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <p className="text-sm font-medium text-foreground">
                        {format(new Date(user.createdAt), "MMM d, yyyy 'at' h:mm a")}
                      </p>
                    </div>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Last Login</p>
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      <p className="text-sm font-medium text-foreground">
                        {user.lastLogin
                          ? format(new Date(user.lastLogin), "MMM d, yyyy 'at' h:mm a")
                          : "Never"}
                      </p>
                    </div>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Last Updated</p>
                    <p className="text-sm font-medium text-foreground">
                      {format(new Date(user.updatedAt), "MMM d, yyyy")}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Additional Information Tabs */}
            {!isEditMode && (
              <Card className="glass-card border-0">
                <CardHeader className="pb-4">
                  <CardTitle className="text-lg font-bold">Additional Information</CardTitle>
                </CardHeader>
                <CardContent>
                  <Tabs defaultValue="activity" className="w-full">
                    <TabsList className="grid w-full grid-cols-5">
                      <TabsTrigger value="activity">
                        <History className="h-4 w-4 mr-2" />
                        Activity
                      </TabsTrigger>
                      <TabsTrigger value="routes">
                        <Route className="h-4 w-4 mr-2" />
                        Routes ({routes.length})
                      </TabsTrigger>
                      <TabsTrigger value="campaigns">
                        <Megaphone className="h-4 w-4 mr-2" />
                        Campaigns ({campaigns.length})
                      </TabsTrigger>
                      <TabsTrigger value="rewards">
                        <Gift className="h-4 w-4 mr-2" />
                        Rewards
                      </TabsTrigger>
                      <TabsTrigger value="points">
                        <Coins className="h-4 w-4 mr-2" />
                        Points
                      </TabsTrigger>
                    </TabsList>

                    <TabsContent value="activity" className="mt-4">
                      {isLoadingAdditionalData ? (
                        <div className="flex items-center justify-center py-8">
                          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                        </div>
                      ) : activityLogs.length > 0 ? (
                        <div className="space-y-3">
                          {activityLogs.map((log, index) => (
                            <div
                              key={index}
                              className="flex items-start gap-3 p-3 bg-muted/30 rounded-lg border border-border/50"
                            >
                              <div className="p-2 bg-primary/10 rounded-lg">
                                <FileText className="h-4 w-4 text-primary" />
                              </div>
                              <div className="flex-1">
                                <p className="text-sm font-semibold text-foreground">
                                  {log.action || "Activity"}
                                </p>
                                <p className="text-xs text-muted-foreground mt-1">
                                  {log.description || "No description"}
                                </p>
                                <p className="text-xs text-muted-foreground mt-1">
                                  {log.created_at
                                    ? format(new Date(log.created_at), "MMM d, yyyy 'at' h:mm a")
                                    : "Unknown date"}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-center py-8 text-muted-foreground">
                          <History className="h-8 w-8 mx-auto mb-2 opacity-50" />
                          <p className="text-sm">No activity logs found</p>
                        </div>
                      )}
                    </TabsContent>

                    <TabsContent value="routes" className="mt-4">
                      {isLoadingAdditionalData ? (
                        <div className="flex items-center justify-center py-8">
                          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                        </div>
                      ) : routes.length > 0 ? (
                        <div className="space-y-2">
                          {routes.map((route) => (
                            <div
                              key={route.id}
                              className="flex items-center justify-between p-3 bg-muted/30 rounded-lg border border-border/50"
                            >
                              <div className="flex items-center gap-3">
                                <Route className="h-4 w-4 text-primary" />
                                <div>
                                  <p className="text-sm font-semibold text-foreground">
                                    {route.name || `Route ${route.id}`}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    {route.status || "Unknown status"}
                                  </p>
                                </div>
                              </div>
                              {route.completed_at && (
                                <p className="text-xs text-muted-foreground">
                                  {format(new Date(route.completed_at), "MMM d, yyyy")}
                                </p>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-center py-8 text-muted-foreground">
                          <Route className="h-8 w-8 mx-auto mb-2 opacity-50" />
                          <p className="text-sm">No routes found</p>
                        </div>
                      )}
                    </TabsContent>

                    <TabsContent value="campaigns" className="mt-4">
                      {isLoadingAdditionalData ? (
                        <div className="flex items-center justify-center py-8">
                          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                        </div>
                      ) : campaigns.length > 0 ? (
                        <div className="space-y-2">
                          {campaigns.map((campaign) => (
                            <div
                              key={campaign.id}
                              className="flex items-center justify-between p-3 bg-muted/30 rounded-lg border border-border/50"
                            >
                              <div className="flex items-center gap-3">
                                <Megaphone className="h-4 w-4 text-primary" />
                                <div>
                                  <p className="text-sm font-semibold text-foreground">
                                    {campaign.name || `Campaign ${campaign.id}`}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    {campaign.status || "Unknown status"}
                                  </p>
                                </div>
                              </div>
                              {campaign.created_at && (
                                <p className="text-xs text-muted-foreground">
                                  {format(new Date(campaign.created_at), "MMM d, yyyy")}
                                </p>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-center py-8 text-muted-foreground">
                          <Megaphone className="h-8 w-8 mx-auto mb-2 opacity-50" />
                          <p className="text-sm">No campaigns found</p>
                        </div>
                      )}
                    </TabsContent>

                    <TabsContent value="rewards" className="mt-4">
                      {isLoadingAdditionalData ? (
                        <div className="flex items-center justify-center py-8">
                          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                        </div>
                      ) : rewardTransactions.length > 0 ? (
                        <div className="space-y-2">
                          {rewardTransactions.map((transaction) => (
                            <div
                              key={transaction.id}
                              className="flex items-center justify-between p-3 bg-muted/30 rounded-lg border border-border/50"
                            >
                              <div className="flex items-center gap-3">
                                <Gift className="h-4 w-4 text-primary" />
                                <div>
                                  <p className="text-sm font-semibold text-foreground">
                                    {transaction.type || "Transaction"}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    {transaction.description || "No description"}
                                  </p>
                                </div>
                              </div>
                              <div className="text-right">
                                <p className="text-sm font-semibold text-foreground">
                                  {transaction.points_amount > 0 ? "+" : ""}
                                  {transaction.points_amount || 0} pts
                                </p>
                                {transaction.created_at && (
                                  <p className="text-xs text-muted-foreground">
                                    {format(new Date(transaction.created_at), "MMM d, yyyy")}
                                  </p>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-center py-8 text-muted-foreground">
                          <Gift className="h-8 w-8 mx-auto mb-2 opacity-50" />
                          <p className="text-sm">No reward transactions found</p>
                        </div>
                      )}
                    </TabsContent>

                    <TabsContent value="points" className="mt-4">
                      {isLoadingAdditionalData ? (
                        <div className="flex items-center justify-center py-8">
                          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                        </div>
                      ) : pointsBalance ? (
                        <div className="space-y-4">
                          <div className="grid grid-cols-2 gap-4">
                            <div className="p-4 bg-primary/10 rounded-lg">
                              <p className="text-xs text-muted-foreground mb-1">Current Balance</p>
                              <p className="text-2xl font-bold text-foreground">
                                {pointsBalance.points_balance || 0}
                              </p>
                            </div>
                            <div className="p-4 bg-primary/10 rounded-lg">
                              <p className="text-xs text-muted-foreground mb-1">Lifetime Earned</p>
                              <p className="text-2xl font-bold text-foreground">
                                {pointsBalance.lifetime_points_earned || 0}
                              </p>
                            </div>
                          </div>
                          {pointsBalance.lifetime_points_redeemed !== undefined && (
                            <div className="p-4 bg-muted/30 rounded-lg">
                              <p className="text-xs text-muted-foreground mb-1">Lifetime Redeemed</p>
                              <p className="text-lg font-semibold text-foreground">
                                {pointsBalance.lifetime_points_redeemed || 0}
                              </p>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="text-center py-8 text-muted-foreground">
                          <Coins className="h-8 w-8 mx-auto mb-2 opacity-50" />
                          <p className="text-sm">No points balance found</p>
                        </div>
                      )}
                    </TabsContent>
                  </Tabs>
                </CardContent>
              </Card>
            )}

            {/* Account Notes */}
            {!isEditMode && user.accountNotes && (
              <Card className="glass-card border-0">
                <CardHeader className="pb-4">
                  <CardTitle className="text-lg font-bold">Account Notes</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-foreground">{user.accountNotes}</p>
                </CardContent>
              </Card>
            )}

            {/* Reset Password Confirmation */}
            {showResetPasswordConfirmation && !isEditMode && (
              <Card className="glass-card border-0 border-amber-200 dark:border-amber-800">
                <CardHeader className="pb-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-amber-50 dark:bg-amber-950 rounded-lg">
                      <KeyRound className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                    </div>
                    <CardTitle className="text-lg font-bold">Reset Password</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">
                      This will send a password reset email to{" "}
                      <span className="font-semibold text-foreground">{user.email}</span>.
                      The user will receive a link to set a new password.
                    </p>
                  </div>

                  <div className="flex items-start gap-3 p-4 bg-muted/30 rounded-xl border border-border/50">
                    <Mail className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-foreground">
                        What happens next?
                      </p>
                      <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                        <li>User receives an email with reset instructions</li>
                        <li>They can click the link to set a new password</li>
                        <li>The link expires after a set time period</li>
                      </ul>
                    </div>
                  </div>

                  <div className="flex gap-2 pt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowResetPasswordConfirmation(false)}
                      disabled={isResettingPassword}
                      className="flex-1"
                    >
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleResetPassword}
                      disabled={isResettingPassword}
                      className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground"
                    >
                      {isResettingPassword ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Sending...
                        </>
                      ) : (
                        <>
                          <KeyRound className="mr-2 h-4 w-4" />
                          Send Reset Email
                        </>
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Footer Actions */}
          <div className="px-6 py-4 border-t glass-card border-0 flex justify-between items-center bg-background/50 backdrop-blur-sm">
            <div className="flex gap-2">
              {isEditMode ? (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCancel}
                    disabled={isLoading}
                  >
                    <X className="mr-2 h-4 w-4" />
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={form.handleSubmit(handleSave)}
                    disabled={isLoading}
                    className="bg-primary hover:bg-primary/90 text-primary-foreground"
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Save className="mr-2 h-4 w-4" />
                        Save
                      </>
                    )}
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIsEditMode(true)}
                  >
                    <Edit className="mr-2 h-4 w-4" />
                    Edit
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowResetPasswordConfirmation(true)}
                    disabled={showResetPasswordConfirmation}
                  >
                    <KeyRound className="mr-2 h-4 w-4" />
                    Reset Password
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleExportUserData}
                    disabled={isExportingData}
                  >
                    {isExportingData ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Exporting...
                      </>
                    ) : (
                      <>
                        <Download className="mr-2 h-4 w-4" />
                        Export Data
                      </>
                    )}
                  </Button>
                </>
              )}
            </div>
            {!isEditMode && !showResetPasswordConfirmation && (
              <DrawerClose asChild>
                <Button variant="outline">Close</Button>
              </DrawerClose>
            )}
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
