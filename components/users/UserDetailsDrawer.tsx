"use client";

import React, { useState, useEffect, useRef } from "react";
import { UserRelationships } from "@/components/users/UserRelationships";
import { AccountStatusRecovery } from "@/components/users/AccountStatusRecovery";
import { useCapability } from "@/hooks/useAdminUser";
import { OrganisationMembershipEditor } from "@/components/users/OrganisationMembershipEditor";
import { accountRoleLabel } from "@/features/identity/domain/accountDomains";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  X,
  Mail,
  Phone,
  Calendar,
  Clock,
  Shield,
  UserCheck,
  UserX,
  Building2,
  Bike,
  Edit,
  KeyRound,
  Save,
  Loader2,
  Download,
  Route,
  Megaphone,
  Gift,
  Coins,
  FileText,
  History,
} from "lucide-react";
import { format } from "date-fns";

import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
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
import {
  User,
  employeeRoleSchema,
  userStatusSchema,
  RewardTransaction,
} from "@/schemas";
import { CopyButton } from "@/components/CopyButton";
import { useToast } from "@/hooks/useToast";
import {
  updateUser,
  sendPasswordResetEmail,
  exportUserData,
  getUserActivityLogs,
  getUserRoutes,
  getUserCampaigns,
  getUserRewardTransactions,
  getUserPointsBalance,
} from "@/app/actions/users";
import { EMPLOYEE_ROLE_OPTIONS } from "@/features/authorization/roleOptions";
import { exportToJSON } from "@/lib/export";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const editUserSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Invalid email address"),
  phone: z.string().optional(),
  employeeRole: employeeRoleSchema.nullable(),
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
  initialMode?: "view" | "edit";
}

export function UserDetailsDrawer({
  user,
  open,
  onOpenChange,
  onUserUpdate,
  initialMode = "view",
}: UserDetailsDrawerProps) {
  const { toast } = useToast();
  const canAssignStaff = useCapability("users.role.assign");
  const canApproveStaff = useCapability("users.role.approve");
  const canManageProfile = useCapability("users.manage");
  const canEditUser = canManageProfile || canAssignStaff || canApproveStaff;
  const [showStaffAccess, setShowStaffAccess] = useState(false);
  const hasRider = !!user && user.riderStatus !== undefined;
  const [isEditMode, setIsEditMode] = useState(false);
  const [isMembershipBusy, setIsMembershipBusy] = useState(false);
  const editBaseline = useRef<{ userId: string; updatedAt: string; employeeRole: User["employeeRole"] } | null>(null);
  const [showResetPasswordConfirmation, setShowResetPasswordConfirmation] =
    useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isResettingPassword, setIsResettingPassword] = useState(false);
  const [isExportingData, setIsExportingData] = useState(false);
  const [activityLogs, setActivityLogs] = useState<any[]>([]);
  const [routes, setRoutes] = useState<any[]>([]);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [rewardTransactions, setRewardTransactions] = useState<
    RewardTransaction[]
  >([]);
  const [pointsBalance, setPointsBalance] = useState<any>(null);
  const [isLoadingAdditionalData, setIsLoadingAdditionalData] = useState(false);

  const form = useForm<z.input<typeof editUserSchema>, unknown, EditUserFormData>({
    resolver: zodResolver(editUserSchema),
    defaultValues: {
      name: "",
      email: "",
      phone: "",
      employeeRole: null,
      status: "active",
      organization: "",
      languagePreference: "en",
      isVerified: false,
      accountNotes: "",
    },
  });

  // Reset form when user changes or edit mode is enabled
  useEffect(() => { if (open) setIsEditMode(initialMode === "edit" && canEditUser); }, [open, user?.id, initialMode, canEditUser]);
  useEffect(() => {
    if (user && isEditMode) {
      editBaseline.current = { userId: user.id, updatedAt: user.updatedAt, employeeRole: user.employeeRole };
      form.reset({
        name: user.name,
        email: user.email,
        phone: user.phone || "",
        employeeRole: user.employeeRole ?? null,
        status: user.status,
        organization: user.organization || "",
        languagePreference: user.languagePreference || "en",
        isVerified: user.isVerified,
        accountNotes: user.accountNotes || "",
      });
    }
  // Membership readback must not discard unsaved profile fields or advance the
  // optimistic profile/employee baseline behind the operator's back.
  }, [user?.id, isEditMode, form]);

  // Reset edit mode and reset password confirmation when drawer closes
  useEffect(() => {
    if (!open) {
      setIsEditMode(false);
      setShowStaffAccess(false);
      setShowResetPasswordConfirmation(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open || !user || isEditMode) {
      if (!open) {
        setActivityLogs([]);
        setRoutes([]);
        setCampaigns([]);
        setRewardTransactions([]);
        setPointsBalance(null);
        setIsLoadingAdditionalData(false);
      }
      return;
    }

    let isMounted = true;

    const loadAdditionalData = async () => {
      setIsLoadingAdditionalData(true);

      try {
        const [
          activityResult,
          routesResult,
          campaignsResult,
          rewardsResult,
          pointsResult,
        ] = await Promise.all([
          getUserActivityLogs(user.id),
          hasRider ? getUserRoutes(user.id) : Promise.resolve({ success: true, data: [] }),
          hasRider ? getUserCampaigns(user.id) : Promise.resolve({ success: true, data: [] }),
          hasRider ? getUserRewardTransactions(user.id) : Promise.resolve({ success: true, data: [] }),
          hasRider ? getUserPointsBalance(user.id) : Promise.resolve({ success: true, data: null }),
        ]);

        if (!isMounted) return;

        setActivityLogs(
          activityResult.success ? (activityResult.data ?? []) : [],
        );
        setRoutes(routesResult.success ? (routesResult.data ?? []) : []);
        setCampaigns(
          campaignsResult.success ? (campaignsResult.data ?? []) : [],
        );
        setRewardTransactions(
          rewardsResult.success ? (rewardsResult.data ?? []) : [],
        );
        setPointsBalance(
          pointsResult.success ? (pointsResult.data ?? null) : null,
        );
      } catch (error) {
        console.error("Load user additional data error:", error);
        if (!isMounted) return;
        setActivityLogs([]);
        setRoutes([]);
        setCampaigns([]);
        setRewardTransactions([]);
        setPointsBalance(null);
      } finally {
        if (isMounted) {
          setIsLoadingAdditionalData(false);
        }
      }
    };

    loadAdditionalData();

    return () => {
      isMounted = false;
    };
  }, [open, user, isEditMode, hasRider]);

  const handleSave = async (data: EditUserFormData) => {
    if (!user || !editBaseline.current || editBaseline.current.userId !== user.id || isMembershipBusy || isResettingPassword) return;

    setIsLoading(true);
    try {
      const { employeeRole, ...profile } = data;
      const result = await updateUser({
        id: user.id,
        expectedUpdatedAt: editBaseline.current.updatedAt,
        ...profile,
        ...(employeeRole !== (editBaseline.current.employeeRole ?? null) ? { employeeRole, expectedEmployeeRole: editBaseline.current.employeeRole ?? null } : {}),
      });

      if (!result.success) {
        throw new Error(result.error || "Failed to update user");
      }

      toast({
        title: "User Updated",
        description: `${data.name}'s profile has been updated successfully.`,
      });

      onUserUpdate?.();
      setShowResetPasswordConfirmation(false);
      setShowStaffAccess(false);
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
    setShowStaffAccess(false);
    setShowResetPasswordConfirmation(false);
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

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active":
        return (
          <Badge variant="success">
            <UserCheck className="h-3 w-3 mr-1" />
            Active
          </Badge>
        );
      case "inactive":
        return (
          <Badge variant="warning">
            <UserX className="h-3 w-3 mr-1" />
            Inactive
          </Badge>
        );
      case "pending":
        return (
          <Badge variant="info">
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
      <DrawerContent className="w-full sm:w-[320px] lg:max-w-[55rem]! p-0 h-full">
        <div className="flex h-full flex-col bg-background">
          <DrawerHeader className="px-6 py-4 border-b border-border">
            <div className="flex items-center justify-between">
              <DrawerTitle className="text-2xl font-bold">
                {isEditMode ? "Edit User" : "User Details"}
              </DrawerTitle>
              <DrawerDescription className="sr-only">
                View and manage user account details.
              </DrawerDescription>
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
                    <form
                      onSubmit={form.handleSubmit(handleSave)}
                      className="space-y-4"
                    >
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField
                          control={form.control}
                          name="name"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-sm font-semibold">
                                Full Name *
                              </FormLabel>
                              <FormControl>
                                <Input
                                  placeholder="John Doe"
                                  className="rounded-xl border-border/50 bg-background/60"
                                  {...field} value={String(field.value ?? "")}
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
                              <FormLabel className="text-sm font-semibold">
                                Email *
                              </FormLabel>
                              <FormControl>
                                <Input
                                  type="email"
                                  readOnly
                                  placeholder="user@example.com"
                                  className="rounded-xl border-border/50 bg-background/60"
                                  {...field} value={String(field.value ?? "")}
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
                              <FormLabel className="text-sm font-semibold">
                                Phone
                              </FormLabel>
                              <FormControl>
                                <Input
                                  type="tel"
                                  placeholder="+1 (555) 123-4567"
                                  className="rounded-xl border-border/50 bg-background/60"
                                  {...field} value={String(field.value ?? "")}
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
                              <FormLabel className="text-sm font-semibold">
                                Organization
                              </FormLabel>
                              <FormControl>
                                <Input
                                  placeholder="Company Name"
                                  className="rounded-xl border-border/50 bg-background/60"
                                  {...field} value={String(field.value ?? "")}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        {(canAssignStaff || canApproveStaff) && !user.employeeRole && !showStaffAccess && <Button type="button" variant="outline" onClick={() => setShowStaffAccess(true)}>Assign Staff Role</Button>}
                        {(canAssignStaff || canApproveStaff) && (user.employeeRole || showStaffAccess) && <>
                        <FormField
                          control={form.control}
                          name="employeeRole"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-sm font-semibold">
                                Internal Staff Role
                              </FormLabel>
                              <Select
                                onValueChange={(value) => {
                                  // Radix's native form control can emit an empty
                                  // initialization event. Only explicit choices
                                  // may change or revoke the Staff grant.
                                  if (value) field.onChange(value === "none" ? null : value);
                                }}
                                value={field.value ?? "none"}
                              >
                                <FormControl>
                                  <SelectTrigger className="rounded-xl border-border/50 bg-background/60">
                                    <SelectValue placeholder="Select role" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="none">No employee access</SelectItem>
                                  {EMPLOYEE_ROLE_OPTIONS.map(option => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        </>}
                        <FormField
                          control={form.control}
                          name="status"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-sm font-semibold">
                                Status *
                              </FormLabel>
                              <Select
                                onValueChange={field.onChange}
                                value={field.value}
                              >
                                <FormControl>
                                  <SelectTrigger className="rounded-xl border-border/50 bg-background/60">
                                    <SelectValue placeholder="Select status" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="active">Active</SelectItem>
                                  <SelectItem value="inactive">
                                    Inactive
                                  </SelectItem>
                                  <SelectItem value="pending">
                                    Pending
                                  </SelectItem>
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
                              <FormLabel className="text-sm font-semibold">
                                Language Preference
                              </FormLabel>
                              <Select
                                onValueChange={field.onChange}
                                value={field.value}
                              >
                                <FormControl>
                                  <SelectTrigger className="rounded-xl border-border/50 bg-background/60">
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
                            <FormItem className="flex flex-row items-center justify-between rounded-xl border border-border/50 bg-background/60 p-4">
                              <div className="space-y-0.5">
                                <FormLabel className="text-sm font-semibold">
                                  Verified Account
                                </FormLabel>
                                <p className="text-xs text-muted-foreground">
                                  Mark account as verified
                                </p>
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
                            <FormLabel className="text-sm font-semibold">
                              Account Notes
                            </FormLabel>
                            <FormControl>
                              <Textarea
                                placeholder="Add internal notes about this user..."
                                className="rounded-xl border-border/50 bg-background/60 min-h-[100px] resize-none"
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <OrganisationMembershipEditor key={user.id} userId={user.id} onChange={onUserUpdate} onBusyChange={setIsMembershipBusy} />
                      <AccountStatusRecovery userId={user.id} pending={user.authSyncPending} onChange={onUserUpdate} />
                    </form>
                  </Form>
                ) : (
                  <>
                    <div className="flex items-center gap-3 mb-2">
                      <h2 className="text-2xl font-bold text-foreground">
                        {user.name}
                      </h2>
                      {user.isVerified && (
                        <Badge variant="success">Verified</Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mb-3">
                      <UserRelationships user={user} organisations={false} />
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
              <Card className="border-border">
                <CardHeader className="pb-4">
                  <CardTitle className="text-lg font-bold">
                    Basic Information
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground mb-1">
                        User ID
                      </p>
                      <div className="flex items-center gap-2">
                        <code className="text-sm font-mono bg-muted px-2 py-1 rounded">
                          {user.id}
                        </code>
                        <CopyButton value={user.id} />
                      </div>
                    </div>
                    {user.organization && <div>
                      <p className="text-sm text-muted-foreground mb-1">
                        Organization
                      </p>
                      <p className="text-sm font-medium text-foreground">
                        {user.organization || "—"}
                      </p>
                    </div>}
                    <div>
                      <p className="text-sm text-muted-foreground mb-1">
                        Language
                      </p>
                      <p className="text-sm font-medium text-foreground uppercase">
                        {user.languagePreference || "en"}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground mb-1">
                        Verified
                      </p>
                      <p className="text-sm font-medium text-foreground">
                        {user.isVerified ? "Yes" : "No"}
                      </p>
                    </div>
                    {user.memberships?.some(member => member.status !== "revoked") && <div className="col-span-2">
                      <p className="text-sm text-muted-foreground mb-1">Organisation Memberships</p>
                      <ul className="space-y-1">{user.memberships.filter(member => member.status !== "revoked").map(member => <li key={member.id} className="text-sm font-medium text-foreground">
                        {member.organisationName} · {accountRoleLabel(member.domain, member.role)}{member.status === "invited" ? " · Invited" : ""}
                      </li>)}</ul>
                    </div>}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Account Activity */}
            <Card className="border-border">
              <CardHeader className="pb-4">
                <CardTitle className="text-lg font-bold">
                  Account Activity
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Joined</p>
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <p className="text-sm font-medium text-foreground">
                        {format(
                          new Date(user.createdAt),
                          "MMM d, yyyy 'at' h:mm a",
                        )}
                      </p>
                    </div>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">
                      Last Active
                    </p>
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      <p className="text-sm font-medium text-foreground">
                        {user.lastActive
                          ? format(
                              new Date(user.lastActive),
                              "MMM d, yyyy 'at' h:mm a",
                            )
                          : user.activityAvailable === false ? "Unavailable" : "No recorded activity"}
                      </p>
                    </div>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">
                      Last Updated
                    </p>
                    <p className="text-sm font-medium text-foreground">
                      {format(new Date(user.updatedAt), "MMM d, yyyy")}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Additional Information Tabs */}
            {!isEditMode && (
              <Card className="border-border">
                <CardHeader className="pb-4">
                  <CardTitle className="text-lg font-bold">
                    Additional Information
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Tabs defaultValue="activity" className="w-full">
                    <TabsList className={`grid w-full ${hasRider ? "grid-cols-5" : "grid-cols-1"}`}>
                      <TabsTrigger value="activity">
                        <History className="h-4 w-4 mr-2" />
                        Activity
                      </TabsTrigger>
                      {hasRider && <TabsTrigger value="routes">
                        <Route className="h-4 w-4 mr-2" />
                        Routes ({routes.length})
                      </TabsTrigger>}
                      {hasRider && <TabsTrigger value="campaigns">
                        <Megaphone className="h-4 w-4 mr-2" />
                        Campaigns ({campaigns.length})
                      </TabsTrigger>}
                      {hasRider && <TabsTrigger value="rewards">
                        <Gift className="h-4 w-4 mr-2" />
                        Rewards
                      </TabsTrigger>}
                      {hasRider && <TabsTrigger value="points">
                        <Coins className="h-4 w-4 mr-2" />
                        Points
                      </TabsTrigger>}
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
                                    ? format(
                                        new Date(log.created_at),
                                        "MMM d, yyyy 'at' h:mm a",
                                      )
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

                    {hasRider && <TabsContent value="routes" className="mt-4">
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
                                  {format(
                                    new Date(route.completed_at),
                                    "MMM d, yyyy",
                                  )}
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
                    </TabsContent>}

                    {hasRider && <TabsContent value="campaigns" className="mt-4">
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
                                  {format(
                                    new Date(campaign.created_at),
                                    "MMM d, yyyy",
                                  )}
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
                    </TabsContent>}

                    {hasRider && <TabsContent value="rewards" className="mt-4">
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
                                    {transaction.description ||
                                      "No description"}
                                  </p>
                                </div>
                              </div>
                              <div className="text-right">
                                <p className="text-sm font-semibold text-foreground">
                                  {transaction.points > 0 ? "+" : ""}
                                  {transaction.points || 0} pts
                                </p>
                                {transaction.createdAt && (
                                  <p className="text-xs text-muted-foreground">
                                    {format(
                                      new Date(transaction.createdAt),
                                      "MMM d, yyyy",
                                    )}
                                  </p>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-center py-8 text-muted-foreground">
                          <Gift className="h-8 w-8 mx-auto mb-2 opacity-50" />
                          <p className="text-sm">
                            No reward transactions found
                          </p>
                        </div>
                      )}
                    </TabsContent>}

                    {hasRider && <TabsContent value="points" className="mt-4">
                      {isLoadingAdditionalData ? (
                        <div className="flex items-center justify-center py-8">
                          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                        </div>
                      ) : pointsBalance ? (
                        <div className="space-y-4">
                          <div className="grid grid-cols-2 gap-4">
                            <div className="p-4 bg-primary/10 rounded-lg">
                              <p className="text-xs text-muted-foreground mb-1">
                                Current Balance
                              </p>
                              <p className="text-2xl font-bold text-foreground">
                                {pointsBalance.points_balance || 0}
                              </p>
                            </div>
                            <div className="p-4 bg-primary/10 rounded-lg">
                              <p className="text-xs text-muted-foreground mb-1">
                                Lifetime Earned
                              </p>
                              <p className="text-2xl font-bold text-foreground">
                                {pointsBalance.lifetime_points_earned || 0}
                              </p>
                            </div>
                          </div>
                          {pointsBalance.lifetime_points_redeemed !==
                            undefined && (
                            <div className="p-4 bg-muted/30 rounded-lg">
                              <p className="text-xs text-muted-foreground mb-1">
                                Lifetime Redeemed
                              </p>
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
                    </TabsContent>}
                  </Tabs>
                </CardContent>
              </Card>
            )}

            {/* Account Notes */}
            {!isEditMode && user.accountNotes && (
              <Card className="border-border">
                <CardHeader className="pb-4">
                  <CardTitle className="text-lg font-bold">
                    Account Notes
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-foreground">{user.accountNotes}</p>
                </CardContent>
              </Card>
            )}

            {/* Reset Password Confirmation */}
            {showResetPasswordConfirmation && isEditMode && (
              <Card className="border-border border-warning/20 dark:border-warning/20">
                <CardHeader className="pb-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-warning/15 rounded-lg">
                      <KeyRound className="h-5 w-5 text-warning" />
                    </div>
                    <CardTitle className="text-lg font-bold">
                      Reset Password
                    </CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">
                      This will send a password reset email to{" "}
                      <span className="font-semibold text-foreground">
                        {user.email}
                      </span>
                      . The user will receive a link to set a new password.
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
          <div className="px-6 py-4 border-t border-border flex justify-between items-center bg-background/50">
            <div className="flex gap-2">
              {isEditMode ? (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCancel}
                    disabled={isLoading || isMembershipBusy || isResettingPassword}
                  >
                    <X className="mr-2 h-4 w-4" />
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={form.handleSubmit(handleSave)}
                    disabled={isLoading || isMembershipBusy || isResettingPassword}
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
                  {canManageProfile && <Button variant="outline" size="sm" onClick={() => setShowResetPasswordConfirmation(true)} disabled={showResetPasswordConfirmation || isMembershipBusy}>
                    <KeyRound className="mr-2 h-4 w-4" />Reset Password
                  </Button>}
                </>
              ) : (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIsEditMode(true)}
                    disabled={!canEditUser}
                  >
                    <Edit className="mr-2 h-4 w-4" />
                    Edit
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
