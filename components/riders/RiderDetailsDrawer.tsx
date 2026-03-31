"use client";

import React, { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { format } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Bike,
  Calendar,
  Coins,
  Download,
  Edit,
  FileText,
  Gift,
  History,
  KeyRound,
  Timer,
  Loader2,
  Mail,
  MapPin,
  Megaphone,
  Phone,
  Route,
  Save,
  ShieldCheck,
  Trash2,
  UserRound,
  X,
} from "lucide-react";

import { deleteUser, exportUserData, getUserActivityLogs, getUserCampaigns, getUserPointsBalance, getUserRewardTransactions, getUserRoutes, sendPasswordResetEmail } from "@/app/actions/users";
import { updateRiderProfile } from "@/app/actions/riders";
import { CopyButton } from "@/components/CopyButton";
import { DASHBOARD_COUNTS_QUERY_KEY } from "@/providers/CountProvider";
import { Rider, updateRiderSchema } from "@/schemas";
import { useToast } from "@/hooks/useToast";
import { exportToJSON } from "@/lib/export";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Drawer, DrawerClose, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

type EditRiderFormData = Omit<import("zod").infer<typeof updateRiderSchema>, "id">;

interface RiderDetailsDrawerProps {
  rider: Rider | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRiderUpdate?: () => void;
}

const statusClass = (status: Rider["status"]) =>
  status === "active"
    ? "bg-green-100 text-green-700 border-green-200"
    : status === "pending"
      ? "bg-blue-50 text-blue-700 border-blue-200"
      : "bg-amber-50 text-amber-700 border-amber-200";

export function RiderDetailsDrawer({
  rider,
  open,
  onOpenChange,
  onRiderUpdate,
}: RiderDetailsDrawerProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isEditMode, setIsEditMode] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showResetConfirmation, setShowResetConfirmation] = useState(false);
  const [activityLogs, setActivityLogs] = useState<any[]>([]);
  const [routes, setRoutes] = useState<any[]>([]);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [rewardTransactions, setRewardTransactions] = useState<any[]>([]);
  const [pointsBalance, setPointsBalance] = useState<any>(null);
  const [isLoadingAdditionalData, setIsLoadingAdditionalData] = useState(false);

  const form = useForm<EditRiderFormData>({
    resolver: zodResolver(updateRiderSchema.omit({ id: true })),
    defaultValues: {
      name: "",
      email: "",
      phone: "",
      status: "active",
      city: "",
      country: "",
      languagePreference: "en",
      accountNotes: "",
      isCertified: false,
      vehicleType: "standard_bike",
      contact: { phone: "", emergencyContact: "", emergencyPhone: "" },
      availability: {
        monday: true,
        tuesday: true,
        wednesday: true,
        thursday: true,
        friday: true,
        saturday: true,
        sunday: true,
      },
      preferredHours: "flexible",
    },
  });

  useEffect(() => {
    if (!rider || !isEditMode) return;
    form.reset({
      name: rider.name,
      email: rider.email,
      phone: rider.phone || "",
      status: rider.status,
      city: rider.city || "",
      country: rider.country || "",
      languagePreference: rider.languagePreference || "en",
      accountNotes: rider.accountNotes || "",
      isCertified: rider.isCertified,
      vehicleType: rider.vehicleType || rider.vehicle.type,
      contact: {
        phone: rider.contact.phone || "",
        emergencyContact: rider.contact.emergencyContact || "",
        emergencyPhone: rider.contact.emergencyPhone || "",
      },
      availability: rider.availability,
      preferredHours: rider.preferredHours,
    });
  }, [form, isEditMode, rider]);

  useEffect(() => {
    if (!open) {
      setIsEditMode(false);
      setShowDeleteDialog(false);
      setShowResetConfirmation(false);
      setActivityLogs([]);
      setRoutes([]);
      setCampaigns([]);
      setRewardTransactions([]);
      setPointsBalance(null);
      setIsLoadingAdditionalData(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open || !rider || isEditMode) return;
    let mounted = true;

    const load = async () => {
      setIsLoadingAdditionalData(true);
      try {
        const [activity, riderRoutes, riderCampaigns, rewards, points] =
          await Promise.all([
            getUserActivityLogs(rider.userId),
            getUserRoutes(rider.userId),
            getUserCampaigns(rider.userId),
            getUserRewardTransactions(rider.userId),
            getUserPointsBalance(rider.userId),
          ]);

        if (!mounted) return;
        setActivityLogs(activity.success ? (activity.data ?? []) : []);
        setRoutes(riderRoutes.success ? (riderRoutes.data ?? []) : []);
        setCampaigns(riderCampaigns.success ? (riderCampaigns.data ?? []) : []);
        setRewardTransactions(rewards.success ? (rewards.data ?? []) : []);
        setPointsBalance(points.success ? (points.data ?? null) : null);
      } finally {
        if (mounted) setIsLoadingAdditionalData(false);
      }
    };

    load();
    return () => {
      mounted = false;
    };
  }, [isEditMode, open, rider]);

  const handleSave = async (data: EditRiderFormData) => {
    if (!rider) return;
    setIsLoading(true);
    try {
      const result = await updateRiderProfile({ id: rider.id, ...data });
      if (!result.success) throw new Error(result.error || "Failed to update rider");
      toast({
        title: "Rider updated",
        description: `${data.name} has been updated successfully.`,
      });
      setIsEditMode(false);
      onRiderUpdate?.();
    } catch (error) {
      toast({
        title: "Update failed",
        description: error instanceof Error ? error.message : "Failed to update rider.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!rider) return;
    setIsResetting(true);
    try {
      const result = await sendPasswordResetEmail(rider.email);
      if (!result.success) throw new Error(result.error || "Failed to send setup email");
      toast({
        title: "Setup email sent",
        description: `A setup or reset link has been sent to ${rider.email}.`,
      });
    } catch (error) {
      toast({
        title: "Email failed",
        description: error instanceof Error ? error.message : "Failed to send setup email.",
        variant: "destructive",
      });
    } finally {
      setIsResetting(false);
    }
  };

  const handleExportData = async () => {
    if (!rider) return;
    setIsExporting(true);
    try {
      const result = await exportUserData(rider.userId);
      if (!result.success || !result.data) {
        throw new Error(result.error || "Failed to export rider data");
      }

      exportToJSON([result.data], {
        filename: `rider_data_${rider.id}_${new Date().toISOString().split("T")[0]}`,
        format: "json",
      });

      toast({
        title: "Export complete",
        description: `Rider data for ${rider.name} has been exported successfully.`,
      });
    } catch (error) {
      toast({
        title: "Export failed",
        description:
          error instanceof Error ? error.message : "Failed to export rider data.",
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
    }
  };

  const handleDelete = async () => {
    if (!rider) return;
    setIsLoading(true);
    try {
      const result = await deleteUser({ userId: rider.userId });
      if (!result.success) throw new Error(result.error || "Failed to delete rider");
      await queryClient.invalidateQueries({ queryKey: DASHBOARD_COUNTS_QUERY_KEY });
      toast({
        title: "Rider deleted",
        description: `${rider.name} and related rider records were deleted.`,
      });
      setShowDeleteDialog(false);
      onOpenChange(false);
      onRiderUpdate?.();
    } catch (error) {
      toast({
        title: "Delete failed",
        description: error instanceof Error ? error.message : "Failed to delete rider.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (!rider) return null;

  return (
    <>
      <Drawer direction="right" open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="w-full sm:w-[320px] lg:max-w-[55rem]! p-0 h-full">
          <div className="h-full flex flex-col bg-gradient-to-b from-background/50 to-background">
            <DrawerHeader className="px-6 py-4 border-b glass-card border-0">
              <div className="flex items-center justify-between">
                <DrawerTitle className="text-2xl font-bold">Rider Details</DrawerTitle>
                <DrawerClose className="rounded-full h-8 w-8 flex items-center justify-center hover:bg-muted transition-colors">
                  <X className="h-4 w-4" />
                  <span className="sr-only">Close</span>
                </DrawerClose>
              </div>
            </DrawerHeader>

            <div className="flex-1 overflow-auto px-6 py-6 space-y-6">
              {isEditMode ? (
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(handleSave)} className="space-y-4 max-w-3xl">
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      {[
                        ["name", "Rider Name"],
                        ["email", "Email"],
                        ["phone", "Phone"],
                        ["city", "City"],
                        ["country", "Country"],
                      ].map(([name, label]) => (
                        <FormField
                          key={name}
                          control={form.control}
                          name={name as keyof EditRiderFormData}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-sm font-semibold">{label}</FormLabel>
                              <FormControl>
                                <Input
                                  {...field}
                                  value={(field.value as string | undefined) ?? ""}
                                  type={name === "email" ? "email" : "text"}
                                  className="rounded-xl border-border/50 bg-background/60 backdrop-blur-sm"
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      ))}
                      <FormField
                        control={form.control}
                        name="status"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-sm font-semibold">Status</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl>
                                <SelectTrigger className="rounded-xl border-border/50 bg-background/60 backdrop-blur-sm">
                                  <SelectValue />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="active">Active</SelectItem>
                                <SelectItem value="pending">Pending</SelectItem>
                                <SelectItem value="inactive">Inactive</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="vehicleType"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-sm font-semibold">Vehicle Type</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl>
                                <SelectTrigger className="rounded-xl border-border/50 bg-background/60 backdrop-blur-sm">
                                  <SelectValue />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="standard_bike">Standard Bike</SelectItem>
                                <SelectItem value="e_bike">E-Bike</SelectItem>
                                <SelectItem value="fat_bike">Fat Bike</SelectItem>
                                <SelectItem value="unknown">Unknown</SelectItem>
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
                            <FormLabel className="text-sm font-semibold">Language</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value || "en"}>
                              <FormControl>
                                <SelectTrigger className="rounded-xl border-border/50 bg-background/60 backdrop-blur-sm">
                                  <SelectValue />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="en">English</SelectItem>
                                <SelectItem value="nl">Dutch</SelectItem>
                                <SelectItem value="de">German</SelectItem>
                                <SelectItem value="fr">French</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="contact.emergencyContact"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-sm font-semibold">Emergency Contact</FormLabel>
                            <FormControl>
                              <Input {...field} value={field.value ?? ""} className="rounded-xl border-border/50 bg-background/60 backdrop-blur-sm" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="contact.emergencyPhone"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-sm font-semibold">Emergency Phone</FormLabel>
                            <FormControl>
                              <Input {...field} value={field.value ?? ""} className="rounded-xl border-border/50 bg-background/60 backdrop-blur-sm" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    <FormField
                      control={form.control}
                      name="isCertified"
                      render={({ field }) => (
                        <FormItem className="flex items-center justify-between rounded-xl border border-border/50 bg-background/50 p-3">
                          <FormLabel className="text-sm font-semibold">Rider Certified</FormLabel>
                          <FormControl>
                            <Switch checked={field.value} onCheckedChange={field.onChange} />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="accountNotes"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-sm font-semibold">Account Notes</FormLabel>
                          <FormControl>
                            <Textarea {...field} value={field.value ?? ""} className="rounded-xl border-border/50 bg-background/60 backdrop-blur-sm min-h-[100px] resize-none" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </form>
                </Form>
              ) : (
                <>
                  <div className="flex items-start gap-4">
                    <Avatar className="h-20 w-20 border border-border/50">
                      <AvatarImage src={rider.avatarUrl} alt={rider.name} />
                      <AvatarFallback className="bg-primary/10 text-primary text-xl font-bold">
                        {rider.name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-2">
                        <h3 className="text-xl font-bold text-foreground">{rider.name}</h3>
                        <CopyButton value={rider.id} />
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Badge className={statusClass(rider.status)}>{rider.status}</Badge>
                        <Badge className={rider.isVerified ? "bg-primary/10 text-primary border-primary/30" : "bg-muted text-muted-foreground border-border"}>
                          <ShieldCheck className="mr-1 h-3 w-3" />
                          {rider.isVerified ? "Verified" : "Unverified"}
                        </Badge>
                        <Badge className={rider.isCertified ? "bg-green-100 text-green-700 border-green-200" : "bg-muted text-muted-foreground border-border"}>
                          {rider.isCertified ? "Certified" : "Not Certified"}
                        </Badge>
                      </div>
                    </div>
                  </div>

                  <Card className="glass-card border-0">
                    <CardHeader className="pb-4"><CardTitle className="text-lg font-bold">Contact & Location</CardTitle></CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex items-center gap-3"><Mail className="h-4 w-4 text-muted-foreground" /><span className="text-sm text-foreground">{rider.email}</span></div>
                      <div className="flex items-center gap-3"><Phone className="h-4 w-4 text-muted-foreground" /><span className="text-sm text-foreground">{rider.phone || "No phone"}</span></div>
                      <div className="flex items-center gap-3"><MapPin className="h-4 w-4 text-muted-foreground" /><span className="text-sm text-foreground">{[rider.city, rider.country].filter(Boolean).join(", ") || "No location"}</span></div>
                      <div className="flex items-center gap-3"><Bike className="h-4 w-4 text-muted-foreground" /><span className="text-sm text-foreground capitalize">{rider.vehicleType || rider.vehicle.type}</span></div>
                    </CardContent>
                  </Card>

                  {rider.accountNotes && (
                    <Card className="glass-card border-0">
                      <CardHeader className="pb-4">
                        <CardTitle className="text-lg font-bold">Account Notes</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-sm text-foreground">{rider.accountNotes}</p>
                      </CardContent>
                    </Card>
                  )}

                  <Card className="glass-card border-0">
                    <CardHeader className="pb-4"><CardTitle className="text-lg font-bold">Operations Snapshot</CardTitle></CardHeader>
                    <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {[["Profile", `${rider.profileCompleteness}%`], ["Routes", String(rider.activeRoutesCount)], ["Rides", String(rider.totalRides)], ["Points", String(rider.pointsBalance)]].map(([label, value]) => (
                        <div key={label} className="p-3 rounded-lg bg-muted/30 border border-border/50">
                          <p className="text-xs text-muted-foreground">{label}</p>
                          <p className="text-xl font-bold text-foreground">{value}</p>
                        </div>
                      ))}
                    </CardContent>
                  </Card>

                  <Card className="glass-card border-0">
                    <CardHeader className="pb-4"><CardTitle className="text-lg font-bold">Additional Information</CardTitle></CardHeader>
                    <CardContent>
                      <Tabs defaultValue="activity" className="w-full">
                        <TabsList className="grid w-full grid-cols-6">
                          <TabsTrigger value="activity"><History className="mr-2 h-4 w-4" />Activity</TabsTrigger>
                          <TabsTrigger value="ride-sessions"><Timer className="mr-2 h-4 w-4" />Rides</TabsTrigger>
                          <TabsTrigger value="routes"><Route className="mr-2 h-4 w-4" />Routes ({routes.length})</TabsTrigger>
                          <TabsTrigger value="campaigns"><Megaphone className="mr-2 h-4 w-4" />Campaigns ({campaigns.length})</TabsTrigger>
                          <TabsTrigger value="rewards"><Gift className="mr-2 h-4 w-4" />Rewards</TabsTrigger>
                          <TabsTrigger value="points"><Coins className="mr-2 h-4 w-4" />Points</TabsTrigger>
                        </TabsList>
                        {isLoadingAdditionalData ? (
                          <div className="flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
                        ) : (
                          <>
                            <TabsContent value="activity" className="mt-4">{activityLogs.length ? activityLogs.map((log, index) => <div key={`${log.id ?? log.created_at ?? index}`} className="rounded-lg border border-border/50 bg-muted/30 p-3 mb-2"><p className="text-sm font-semibold text-foreground">{log.action || "Activity"}</p><p className="text-xs text-muted-foreground mt-1">{log.description || "No description"}</p></div>) : <div className="text-center py-8 text-muted-foreground"><History className="h-8 w-8 mx-auto mb-2 opacity-50" /><p className="text-sm">No activity logs found</p></div>}</TabsContent>
                            <TabsContent value="ride-sessions" className="mt-4"><div className="text-center py-8 text-muted-foreground"><Timer className="h-8 w-8 mx-auto mb-2 opacity-50" /><p className="text-sm font-medium">Ride session history</p><p className="text-xs mt-1">View full ride session history on the <a href="/ride-sessions" className="text-primary underline underline-offset-2">Ride Sessions</a> page.</p></div></TabsContent>
                            <TabsContent value="routes" className="mt-4">{routes.length ? routes.map((route) => <div key={route.id} className="rounded-lg border border-border/50 bg-muted/30 p-3 mb-2"><p className="text-sm font-semibold text-foreground">{route.name || `Route ${route.id}`}</p><p className="text-xs text-muted-foreground">{route.status || "Unknown status"}</p></div>) : <div className="text-center py-8 text-muted-foreground"><Route className="h-8 w-8 mx-auto mb-2 opacity-50" /><p className="text-sm">No routes found</p></div>}</TabsContent>
                            <TabsContent value="campaigns" className="mt-4">{campaigns.length ? campaigns.map((campaign) => <div key={campaign.id} className="rounded-lg border border-border/50 bg-muted/30 p-3 mb-2"><p className="text-sm font-semibold text-foreground">{campaign.name || `Campaign ${campaign.id}`}</p><p className="text-xs text-muted-foreground">{campaign.lifecycle_status || campaign.status || "Unknown status"}</p></div>) : <div className="text-center py-8 text-muted-foreground"><Megaphone className="h-8 w-8 mx-auto mb-2 opacity-50" /><p className="text-sm">No campaigns found</p></div>}</TabsContent>
                            <TabsContent value="rewards" className="mt-4">{rewardTransactions.length ? rewardTransactions.map((transaction) => <div key={transaction.id} className="flex items-center justify-between rounded-lg border border-border/50 bg-muted/30 p-3 mb-2"><div><p className="text-sm font-semibold text-foreground">{transaction.source || "Transaction"}</p><p className="text-xs text-muted-foreground">{format(new Date(transaction.created_at), "MMM d, yyyy")}</p></div><p className="text-sm font-semibold text-foreground">{transaction.points_earned > 0 ? "+" : ""}{transaction.points_earned || 0} pts</p></div>) : <div className="text-center py-8 text-muted-foreground"><Gift className="h-8 w-8 mx-auto mb-2 opacity-50" /><p className="text-sm">No reward transactions found</p></div>}</TabsContent>
                            <TabsContent value="points" className="mt-4">{pointsBalance ? <div className="grid grid-cols-1 gap-4 md:grid-cols-2"><div className="rounded-lg bg-primary/10 p-4"><p className="text-xs text-muted-foreground mb-1">Current Balance</p><p className="text-2xl font-bold text-foreground">{pointsBalance.points_balance || 0}</p></div><div className="rounded-lg bg-primary/10 p-4"><p className="text-xs text-muted-foreground mb-1">Lifetime Earned</p><p className="text-2xl font-bold text-foreground">{pointsBalance.lifetime_points_earned || 0}</p></div></div> : <div className="text-center py-8 text-muted-foreground"><Coins className="h-8 w-8 mx-auto mb-2 opacity-50" /><p className="text-sm">No points balance found</p></div>}</TabsContent>
                          </>
                        )}
                      </Tabs>
                    </CardContent>
                  </Card>

                  {showResetConfirmation && (
                    <Card className="glass-card border-0 border-amber-200 dark:border-amber-800">
                      <CardHeader className="pb-4">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-amber-50 dark:bg-amber-950 rounded-lg">
                            <KeyRound className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                          </div>
                          <CardTitle className="text-lg font-bold">Send Setup Email</CardTitle>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <p className="text-sm text-muted-foreground">
                          This will send a secure setup or reset link to{" "}
                          <span className="font-semibold text-foreground">{rider.email}</span>.
                        </p>
                        <div className="flex items-start gap-3 p-4 bg-muted/30 rounded-xl border border-border/50">
                          <Mail className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                          <div className="space-y-1">
                            <p className="text-sm font-semibold text-foreground">What happens next?</p>
                            <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                              <li>The rider receives an email with a secure link</li>
                              <li>They can set or reset their password from that link</li>
                              <li>The link expires after a limited time</li>
                            </ul>
                          </div>
                        </div>
                        <div className="flex gap-2 pt-2">
                          <Button variant="outline" size="sm" onClick={() => setShowResetConfirmation(false)} disabled={isResetting} className="flex-1">
                            Cancel
                          </Button>
                          <Button size="sm" onClick={handleResetPassword} disabled={isResetting} className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground">
                            {isResetting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Sending...</> : <><KeyRound className="mr-2 h-4 w-4" />Send Email</>}
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  <Card className="glass-card border-0">
                    <CardHeader className="pb-4"><CardTitle className="text-lg font-bold">Identity & Audit</CardTitle></CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex items-center gap-3"><UserRound className="h-4 w-4 text-muted-foreground" /><span className="text-sm text-foreground">Linked user ID: {rider.userId}</span></div>
                      <div className="flex items-center gap-3"><Calendar className="h-4 w-4 text-muted-foreground" /><span className="text-sm text-foreground">Created: {format(new Date(rider.createdAt), "MMM d, yyyy")}</span></div>
                      <div className="flex items-center gap-3"><Calendar className="h-4 w-4 text-muted-foreground" /><span className="text-sm text-foreground">Last Active: {rider.lastActivityAt ? format(new Date(rider.lastActivityAt), "MMM d, yyyy 'at' h:mm a") : "Never"}</span></div>
                    </CardContent>
                  </Card>
                </>
              )}
            </div>

            <div className="px-6 py-4 border-t glass-card border-0 flex justify-between items-center bg-background/50 backdrop-blur-sm">
              <div className="flex gap-2">
                {isEditMode ? (
                  <>
                    <Button variant="outline" size="sm" onClick={() => setIsEditMode(false)} disabled={isLoading}><X className="mr-2 h-4 w-4" />Cancel</Button>
                    <Button size="sm" onClick={form.handleSubmit(handleSave)} disabled={isLoading} className="bg-primary hover:bg-primary/90 text-primary-foreground">{isLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving...</> : <><Save className="mr-2 h-4 w-4" />Save</>}</Button>
                  </>
                ) : (
                  <>
                    <Button variant="outline" size="sm" onClick={() => setIsEditMode(true)}><Edit className="mr-2 h-4 w-4" />Edit</Button>
                    <Button variant="outline" size="sm" onClick={() => setShowResetConfirmation(true)} disabled={showResetConfirmation || isResetting}><KeyRound className="mr-2 h-4 w-4" />Send Setup Email</Button>
                    <Button variant="outline" size="sm" onClick={handleExportData} disabled={isExporting}>{isExporting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Exporting...</> : <><Download className="mr-2 h-4 w-4" />Export Data</>}</Button>
                    <Button variant="outline" size="sm" onClick={() => setShowDeleteDialog(true)} className="text-destructive hover:text-destructive"><Trash2 className="mr-2 h-4 w-4" />Delete</Button>
                  </>
                )}
              </div>
              {!isEditMode && <DrawerClose asChild><Button variant="outline">Close</Button></DrawerClose>}
            </div>
          </div>
        </DrawerContent>
      </Drawer>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <div className="mb-2 flex items-center gap-3">
              <div className="rounded-xl bg-red-100 p-2 dark:bg-red-950"><AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" /></div>
              <AlertDialogTitle>Delete rider account</AlertDialogTitle>
            </div>
            <AlertDialogDescription>This permanently deletes the linked user, rider profile, reward data, route assignments, and campaign participation records.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isLoading}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={isLoading} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">{isLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Deleting...</> : "Delete rider"}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
