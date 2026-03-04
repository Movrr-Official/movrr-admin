"use client";

import React, { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format } from "date-fns";
import {
  AlertTriangle,
  BadgeCheck,
  Building2,
  Calendar,
  Edit,
  Globe,
  Loader2,
  Mail,
  Phone,
  Save,
  Trash2,
  User,
  X,
} from "lucide-react";

import { Advertiser } from "@/schemas";
import { useToast } from "@/hooks/useToast";
import {
  deleteAdvertiserProfile,
  updateAdvertiserProfile,
} from "@/app/actions/advertisers";
import { CompanyLogoUploadField } from "@/components/advertisers/CompanyLogoUploadField";
import { CopyButton } from "@/components/CopyButton";
import { NEXT_PUBLIC_ADVERTISER_LOGO_MAX_FILE_SIZE_MB } from "@/lib/env";
import { formatCurrencyEUR } from "@/lib/currency";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormDescription,
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

const editAdvertiserSchema = z.object({
  companyName: z.string().min(2, "Company name is required"),
  contactName: z.string().min(1, "Contact name is required"),
  email: z.string().email("Valid email is required"),
  phone: z.string().optional(),
  website: z.string().optional(),
  logoUrl: z.string().url("Logo URL must be valid").optional().or(z.literal("")),
  industry: z.string().optional(),
  language: z.string().default("en"),
  timezone: z.string().default("UTC"),
  emailNotifications: z.boolean().default(true),
  campaignUpdates: z.boolean().default(true),
  budget: z.coerce.number().min(0, "Budget cannot be negative").default(0),
  status: z.enum(["active", "inactive", "pending"]),
});

type EditAdvertiserData = z.infer<typeof editAdvertiserSchema>;

interface AdvertiserDetailsDrawerProps {
  advertiser: Advertiser | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdvertiserUpdate?: () => void;
}

const statusBadgeClass = (status: Advertiser["status"]) => {
  if (status === "active") return "bg-green-100 text-green-700 border-green-200";
  if (status === "pending") return "bg-blue-50 text-blue-700 border-blue-200";
  return "bg-amber-50 text-amber-700 border-amber-200";
};

export function AdvertiserDetailsDrawer({
  advertiser,
  open,
  onOpenChange,
  onAdvertiserUpdate,
}: AdvertiserDetailsDrawerProps) {
  const { toast } = useToast();
  const [isEditMode, setIsEditMode] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const form = useForm<EditAdvertiserData>({
    resolver: zodResolver(editAdvertiserSchema),
    defaultValues: {
      companyName: "",
      contactName: "",
      email: "",
      phone: "",
      website: "",
      logoUrl: "",
      industry: "",
      language: "en",
      timezone: "UTC",
      emailNotifications: true,
      campaignUpdates: true,
      budget: 0,
      status: "active",
    },
  });

  useEffect(() => {
    if (!advertiser || !isEditMode) return;
    form.reset({
      companyName: advertiser.companyName,
      contactName: advertiser.contactName || "",
      email: advertiser.email || "",
      phone: advertiser.phone || "",
      website: advertiser.website || "",
      logoUrl: advertiser.logoUrl || "",
      industry: advertiser.industry || "",
      language: advertiser.language || "en",
      timezone: advertiser.timezone || "UTC",
      emailNotifications: advertiser.emailNotifications ?? true,
      campaignUpdates: advertiser.campaignUpdates ?? true,
      budget: advertiser.budget || 0,
      status: advertiser.status,
    });
  }, [advertiser, isEditMode, form]);

  useEffect(() => {
    if (!open) {
      setIsEditMode(false);
      setShowDeleteDialog(false);
    }
  }, [open]);

  const handleSave = async (data: EditAdvertiserData) => {
    if (!advertiser) return;

    setIsLoading(true);
    try {
      const result = await updateAdvertiserProfile({
        id: advertiser.id,
        companyName: data.companyName,
        contactName: data.contactName,
        email: data.email,
        phone: data.phone,
        website: data.website,
        logoUrl: data.logoUrl || undefined,
        industry: data.industry,
        language: data.language,
        timezone: data.timezone,
        emailNotifications: data.emailNotifications,
        campaignUpdates: data.campaignUpdates,
        budget: data.budget,
        status: data.status,
      });

      if (!result.success) {
        throw new Error(result.error || "Failed to update advertiser");
      }

      toast({
        title: "Advertiser updated",
        description: `${data.companyName} has been updated successfully.`,
      });
      setIsEditMode(false);
      onAdvertiserUpdate?.();
    } catch (error) {
      toast({
        title: "Update failed",
        description:
          error instanceof Error
            ? error.message
            : "Failed to update advertiser profile.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!advertiser) return;

    setIsLoading(true);
    try {
      const result = await deleteAdvertiserProfile({ id: advertiser.id });
      if (!result.success) {
        throw new Error(result.error || "Failed to delete advertiser");
      }

      toast({
        title: "Advertiser deleted",
        description: `${advertiser.companyName} profile has been removed.`,
      });
      setShowDeleteDialog(false);
      onOpenChange(false);
      onAdvertiserUpdate?.();
    } catch (error) {
      toast({
        title: "Delete blocked",
        description:
          error instanceof Error
            ? error.message
            : "Unable to delete advertiser profile.",
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

  if (!advertiser) return null;

  return (
    <>
      <Drawer direction="right" open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="w-full sm:w-[320px] lg:max-w-[55rem]! p-0 h-full">
          <div className="h-full flex flex-col bg-gradient-to-b from-background/50 to-background">
            <DrawerHeader className="px-6 py-4 border-b glass-card border-0">
              <div className="flex items-center justify-between">
                <DrawerTitle className="text-2xl font-bold">
                  Advertiser Details
                </DrawerTitle>
                <DrawerClose className="rounded-full h-8 w-8 flex items-center justify-center hover:bg-muted transition-colors">
                  <X className="h-4 w-4" />
                  <span className="sr-only">Close</span>
                </DrawerClose>
              </div>
            </DrawerHeader>

            <div className="flex-1 overflow-auto px-6 py-6 space-y-6">
              {isEditMode ? (
                <Form {...form}>
                  <form
                    onSubmit={form.handleSubmit(handleSave)}
                    className="space-y-4 max-w-3xl"
                  >
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      <FormField
                        control={form.control}
                        name="companyName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-sm font-semibold">
                              Company Name *
                            </FormLabel>
                            <FormControl>
                              <Input
                                {...field}
                                className="rounded-xl border-border/50 bg-background/60 backdrop-blur-sm"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="contactName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-sm font-semibold">
                              Contact Name *
                            </FormLabel>
                            <FormControl>
                              <Input
                                {...field}
                                className="rounded-xl border-border/50 bg-background/60 backdrop-blur-sm"
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
                                {...field}
                                className="rounded-xl border-border/50 bg-background/60 backdrop-blur-sm"
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
                                {...field}
                                className="rounded-xl border-border/50 bg-background/60 backdrop-blur-sm"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="website"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-sm font-semibold">
                              Website
                            </FormLabel>
                            <FormControl>
                              <Input
                                {...field}
                                placeholder="https://example.com"
                                className="rounded-xl border-border/50 bg-background/60 backdrop-blur-sm"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="status"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-sm font-semibold">
                              Status
                            </FormLabel>
                            <Select
                              onValueChange={field.onChange}
                              value={field.value}
                            >
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
                        name="budget"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-sm font-semibold">
                              Budget
                            </FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                min="0"
                                step="0.01"
                                value={field.value}
                                onChange={(event) =>
                                  field.onChange(event.target.value)
                                }
                                className="rounded-xl border-border/50 bg-background/60 backdrop-blur-sm"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="language"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-sm font-semibold">
                              Language
                            </FormLabel>
                            <Select
                              onValueChange={field.onChange}
                              value={field.value || "en"}
                            >
                              <FormControl>
                                <SelectTrigger className="rounded-xl border-border/50 bg-background/60 backdrop-blur-sm">
                                  <SelectValue placeholder="Select language" />
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
                        name="timezone"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-sm font-semibold">
                              Timezone
                            </FormLabel>
                            <FormControl>
                              <Input
                                {...field}
                                placeholder="UTC"
                                className="rounded-xl border-border/50 bg-background/60 backdrop-blur-sm"
                              />
                            </FormControl>
                            <FormDescription>
                              Example: UTC, Europe/Amsterdam
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    <FormField
                      control={form.control}
                      name="industry"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-sm font-semibold">
                            Industry
                          </FormLabel>
                          <FormControl>
                            <Textarea
                              {...field}
                              className="rounded-xl border-border/50 bg-background/60 backdrop-blur-sm min-h-[90px] resize-none"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      <FormField
                        control={form.control}
                        name="emailNotifications"
                        render={({ field }) => (
                          <FormItem className="flex items-center justify-between rounded-xl border border-border/50 bg-background/50 p-3">
                            <div>
                              <FormLabel className="text-sm font-semibold">
                                Email Notifications
                              </FormLabel>
                              <FormDescription>
                                Enable general notifications.
                              </FormDescription>
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
                      <FormField
                        control={form.control}
                        name="campaignUpdates"
                        render={({ field }) => (
                          <FormItem className="flex items-center justify-between rounded-xl border border-border/50 bg-background/50 p-3">
                            <div>
                              <FormLabel className="text-sm font-semibold">
                                Campaign Updates
                              </FormLabel>
                              <FormDescription>
                                Send campaign change alerts.
                              </FormDescription>
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
                      name="logoUrl"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-sm font-semibold">
                            Company Logo
                          </FormLabel>
                          <FormControl>
                            <CompanyLogoUploadField
                              value={field.value}
                              onChange={field.onChange}
                              disabled={isLoading}
                            />
                          </FormControl>
                          <FormDescription>
                            {`Upload a square logo image (PNG, JPG, WEBP). Max size ${NEXT_PUBLIC_ADVERTISER_LOGO_MAX_FILE_SIZE_MB}MB.`}
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </form>
                </Form>
              ) : (
                <>
                  <div className="flex items-start gap-4">
                    {advertiser.logoUrl ? (
                      <div className="h-20 w-20 overflow-hidden rounded-2xl border border-border/50 bg-muted">
                        <img
                          src={advertiser.logoUrl}
                          alt={`${advertiser.companyName} logo`}
                          className="h-full w-full object-cover"
                        />
                      </div>
                    ) : (
                      <div className="h-20 w-20 rounded-2xl bg-primary/10 flex items-center justify-center">
                        <Building2 className="h-10 w-10 text-primary" />
                      </div>
                    )}
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-2">
                        <h3 className="text-xl font-bold text-foreground">
                          {advertiser.companyName}
                        </h3>
                        <CopyButton value={advertiser.id} />
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge className={statusBadgeClass(advertiser.status)}>
                          {advertiser.status}
                        </Badge>
                        <Badge
                          className={
                            advertiser.verified
                              ? "bg-green-100 text-green-700 border-green-200"
                              : "bg-muted text-muted-foreground border-border"
                          }
                        >
                          <BadgeCheck className="h-3 w-3 mr-1" />
                          {advertiser.verified ? "Verified" : "Unverified"}
                        </Badge>
                      </div>
                    </div>
                  </div>

                  <Card className="glass-card border-0">
                    <CardHeader className="pb-4">
                      <CardTitle className="text-lg font-bold">
                        Contact Information
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex items-center gap-3">
                        <Mail className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm text-foreground">
                          {advertiser.email || "No email"}
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <Phone className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm text-foreground">
                          {advertiser.phone || "No phone"}
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <Globe className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm text-foreground">
                          {advertiser.website || "No website"}
                        </span>
                      </div>
                      <div className="flex items-start gap-3">
                        <User className="h-4 w-4 text-muted-foreground mt-0.5" />
                        <span className="text-sm text-foreground">
                          {advertiser.contactName || "No contact name"}
                        </span>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="glass-card border-0">
                    <CardHeader className="pb-4">
                      <CardTitle className="text-lg font-bold">
                        Performance Snapshot
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <div className="p-3 rounded-lg bg-muted/30 border border-border/50">
                        <p className="text-xs text-muted-foreground">Campaigns</p>
                        <p className="text-xl font-bold text-foreground">
                          {advertiser.totalCampaigns}
                        </p>
                      </div>
                      <div className="p-3 rounded-lg bg-muted/30 border border-border/50">
                        <p className="text-xs text-muted-foreground">Active</p>
                        <p className="text-xl font-bold text-foreground">
                          {advertiser.activeCampaigns}
                        </p>
                      </div>
                      <div className="p-3 rounded-lg bg-muted/30 border border-border/50">
                        <p className="text-xs text-muted-foreground">Impressions</p>
                        <p className="text-xl font-bold text-foreground">
                          {advertiser.totalImpressions.toLocaleString()}
                        </p>
                      </div>
                      <div className="p-3 rounded-lg bg-muted/30 border border-border/50">
                        <p className="text-xs text-muted-foreground">Budget</p>
                        <p className="text-xl font-bold text-foreground">
                          {formatCurrencyEUR(advertiser.budget)}
                        </p>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="glass-card border-0">
                    <CardHeader className="pb-4">
                      <CardTitle className="text-lg font-bold">
                        Additional Information
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex items-center gap-3">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm text-foreground">
                          Created:{" "}
                          {format(new Date(advertiser.createdAt), "MMM d, yyyy")}
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm text-foreground">
                          Updated:{" "}
                          {format(new Date(advertiser.updatedAt), "MMM d, yyyy")}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Linked user ID: {advertiser.userId}
                      </p>
                    </CardContent>
                  </Card>
                </>
              )}
            </div>

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
                      disabled={isLoading}
                    >
                      <Edit className="mr-2 h-4 w-4" />
                      Edit
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowDeleteDialog(true)}
                      disabled={isLoading}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete
                    </Button>
                  </>
                )}
              </div>
              {!isEditMode && (
                <DrawerClose asChild>
                  <Button variant="outline">Close</Button>
                </DrawerClose>
              )}
            </div>
          </div>
        </DrawerContent>
      </Drawer>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <div className="mb-2 flex items-center gap-3">
              <div className="rounded-xl bg-red-100 p-2 dark:bg-red-950">
                <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
              </div>
              <AlertDialogTitle>Delete advertiser profile</AlertDialogTitle>
            </div>
            <AlertDialogDescription>
              This removes only the advertiser profile. Linked user account is
              kept. Deletion is blocked when campaigns still reference this
              advertiser.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isLoading}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isLoading}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Delete profile"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
