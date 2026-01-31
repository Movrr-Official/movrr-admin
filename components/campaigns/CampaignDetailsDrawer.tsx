"use client";

import React, { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  X,
  Calendar,
  Clock,
  DollarSign,
  Target,
  Eye,
  MousePointerClick,
  TrendingUp,
  MapPin,
  Users,
  Bike,
  Megaphone,
  CheckCircle2,
  AlertCircle,
  FileText,
  PlayCircle,
  PauseCircle,
  Edit,
  Save,
  Loader2,
  UserPlus,
  UserMinus,
  RefreshCw,
  Copy,
  Trash2,
  AlertTriangle,
} from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
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
import { Campaign, campaignStatusSchema, campaignTypeSchema } from "@/schemas";
import { CopyButton } from "@/components/CopyButton";
import { useToast } from "@/hooks/useToast";
import {
  updateCampaign,
  updateCampaignStatus,
  runCampaignSelection,
  deleteCampaign,
  duplicateCampaign,
} from "@/app/actions/campaigns";

const editCampaignSchema = z.object({
  name: z.string().min(1, "Name is required"),
  brand: z.string().optional(),
  description: z.string().optional(),
  budget: z.number().min(0, "Budget must be positive"),
  startDate: z.string().min(1, "Start date is required"),
  endDate: z.string().min(1, "End date is required"),
  impressionGoal: z.number().min(0, "Impression goal must be positive"),
  campaignType: campaignTypeSchema,
  targetZones: z.array(z.string()).optional(),
  vehicleTypeRequired: z.enum(["bike", "e-bike", "cargo-bike"]),
  deliveryMode: z.enum(["manual", "automated"]),
});

type EditCampaignFormData = z.infer<typeof editCampaignSchema>;

interface CampaignDetailsDrawerProps {
  campaign: Campaign | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCampaignUpdate?: () => void;
}

export function CampaignDetailsDrawer({
  campaign,
  open,
  onOpenChange,
  onCampaignUpdate,
}: CampaignDetailsDrawerProps) {
  const { toast } = useToast();
  const [isEditMode, setIsEditMode] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showRunSelectionDialog, setShowRunSelectionDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showDuplicateDialog, setShowDuplicateDialog] = useState(false);
  const [isRunningSelection, setIsRunningSelection] = useState(false);

  const form = useForm<EditCampaignFormData>({
    resolver: zodResolver(editCampaignSchema),
    defaultValues: {
      name: "",
      brand: "",
      description: "",
      budget: 0,
      startDate: "",
      endDate: "",
      impressionGoal: 0,
      campaignType: "branding",
      targetZones: [],
      vehicleTypeRequired: "bike",
      deliveryMode: "manual",
    },
  });

  // Reset form when campaign changes or edit mode is enabled
  useEffect(() => {
    if (campaign && isEditMode) {
      // Convert ISO date strings to datetime-local format (YYYY-MM-DDTHH:mm)
      const formatDateForInput = (isoString: string) => {
        const date = new Date(isoString);
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, "0");
        const day = String(date.getDate()).padStart(2, "0");
        const hours = String(date.getHours()).padStart(2, "0");
        const minutes = String(date.getMinutes()).padStart(2, "0");
        return `${year}-${month}-${day}T${hours}:${minutes}`;
      };

      form.reset({
        name: campaign.name,
        brand: campaign.brand || "",
        description: campaign.description || "",
        budget: campaign.budget,
        startDate: formatDateForInput(campaign.startDate),
        endDate: formatDateForInput(campaign.endDate),
        impressionGoal: campaign.impressionGoal,
        campaignType: campaign.campaignType,
        targetZones: campaign.targetZones || [],
        vehicleTypeRequired: campaign.vehicleTypeRequired,
        deliveryMode: campaign.deliveryMode,
      });
    }
  }, [campaign, isEditMode, form]);

  // Reset edit mode when drawer closes
  useEffect(() => {
    if (!open) {
      setIsEditMode(false);
    }
  }, [open]);

  const handleSave = async (data: EditCampaignFormData) => {
    if (!campaign) return;

    setIsLoading(true);
    try {
      // Convert datetime-local format to ISO string
      const startDateISO = new Date(data.startDate).toISOString();
      const endDateISO = new Date(data.endDate).toISOString();

      const result = await updateCampaign({
        id: campaign.id,
        name: data.name,
        description: data.description,
        budget: data.budget,
        startDate: startDateISO,
        endDate: endDateISO,
        campaignType: data.campaignType,
        targetZones: data.targetZones,
        vehicleTypeRequired: data.vehicleTypeRequired,
        deliveryMode: data.deliveryMode,
      });

      if (!result.success) {
        throw new Error(result.error || "Failed to update campaign");
      }

      toast({
        title: "Campaign Updated",
        description: `${data.name} has been updated successfully.`,
      });

      onCampaignUpdate?.();
      setIsEditMode(false);
    } catch (error) {
      toast({
        title: "Update Failed",
        description:
          error instanceof Error
            ? error.message
            : "Failed to update campaign. Please try again.",
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

  const handleStatusChange = async (newStatus: z.infer<typeof campaignStatusSchema>) => {
    if (!campaign) return;

    setIsLoading(true);
    try {
      const result = await updateCampaignStatus(campaign.id, newStatus);

      if (!result.success) {
        throw new Error(result.error || "Failed to update campaign status");
      }

      toast({
        title: "Status Updated",
        description: `Campaign status changed to ${newStatus}.`,
      });

      onCampaignUpdate?.();
    } catch (error) {
      toast({
        title: "Update Failed",
        description:
          error instanceof Error
            ? error.message
            : "Failed to update campaign status. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleRunSelection = async () => {
    if (!campaign) return;

    setIsRunningSelection(true);
    try {
      const result = await runCampaignSelection(campaign.id, "first_come_first_served");

      if (!result.success) {
        throw new Error(result.error || "Failed to run campaign selection");
      }

      toast({
        title: "Selection Completed",
        description: `Selection completed: ${result.data?.selectedCount || 0} selected, ${result.data?.rejectedCount || 0} rejected.`,
      });

      setShowRunSelectionDialog(false);
      onCampaignUpdate?.();
    } catch (error) {
      toast({
        title: "Selection Failed",
        description:
          error instanceof Error
            ? error.message
            : "Failed to run campaign selection. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsRunningSelection(false);
    }
  };

  const handleDuplicate = async () => {
    if (!campaign) return;

    setIsLoading(true);
    try {
      const result = await duplicateCampaign(campaign.id);

      if (!result.success) {
        throw new Error(result.error || "Failed to duplicate campaign");
      }

      toast({
        title: "Campaign Duplicated",
        description: `Campaign "${campaign.name}" has been duplicated successfully.`,
      });

      setShowDuplicateDialog(false);
      onCampaignUpdate?.();
      onOpenChange(false);
    } catch (error) {
      toast({
        title: "Duplication Failed",
        description:
          error instanceof Error
            ? error.message
            : "Failed to duplicate campaign. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!campaign) return;

    setIsLoading(true);
    try {
      const result = await deleteCampaign(campaign.id);

      if (!result.success) {
        throw new Error(result.error || "Failed to delete campaign");
      }

      toast({
        title: "Campaign Deleted",
        description: `Campaign "${campaign.name}" has been deleted.`,
      });

      setShowDeleteDialog(false);
      onCampaignUpdate?.();
      onOpenChange(false);
    } catch (error) {
      toast({
        title: "Delete Failed",
        description:
          error instanceof Error
            ? error.message
            : "Failed to delete campaign. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (!campaign) return null;

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active":
        return (
          <Badge className="bg-green-100 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300">
            <PlayCircle className="h-3 w-3 mr-1" />
            Active
          </Badge>
        );
      case "paused":
        return (
          <Badge className="bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300">
            <PauseCircle className="h-3 w-3 mr-1" />
            Paused
          </Badge>
        );
      case "draft":
        return (
          <Badge className="bg-muted text-muted-foreground border-border">
            <FileText className="h-3 w-3 mr-1" />
            Draft
          </Badge>
        );
      case "completed":
        return (
          <Badge className="bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Completed
          </Badge>
        );
      case "cancelled":
        return (
          <Badge className="bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300">
            <AlertCircle className="h-3 w-3 mr-1" />
            Cancelled
          </Badge>
        );
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const getTypeBadge = (type: string) => {
    switch (type) {
      case "branding":
        return (
          <Badge className="bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300">
            <Megaphone className="h-3 w-3 mr-1" />
            Branding
          </Badge>
        );
      case "conversion":
        return (
          <Badge className="bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300">
            <Target className="h-3 w-3 mr-1" />
            Conversion
          </Badge>
        );
      default:
        return <Badge variant="secondary">{type}</Badge>;
    }
  };

  const budgetUtilization = campaign.budget > 0
    ? Math.round((campaign.spent / campaign.budget) * 100)
    : 0;

  const startDate = new Date(campaign.startDate);
  const endDate = new Date(campaign.endDate);
  const now = new Date();
  const isActive = now >= startDate && now <= endDate;

  // Available zones for selection (mock data - should come from API)
  const availableZones = [
    "Amsterdam",
    "Rotterdam",
    "Utrecht",
    "The Hague",
    "Eindhoven",
    "Groningen",
    "Tilburg",
    "Almere",
  ];

  return (
    <>
      <Drawer direction="right" open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="w-full sm:w-[320px] lg:max-w-[55rem]! p-0 h-full">
          <div className="h-full flex flex-col bg-gradient-to-b from-background/50 to-background">
            <DrawerHeader className="px-6 py-4 border-b glass-card border-0">
              <div className="flex items-center justify-between">
                <DrawerTitle className="text-2xl font-bold">Campaign Details</DrawerTitle>
                <DrawerClose className="rounded-full h-8 w-8 flex items-center justify-center hover:bg-muted transition-colors">
                  <X className="h-4 w-4" />
                  <span className="sr-only">Close</span>
                </DrawerClose>
              </div>
            </DrawerHeader>

            <div className="flex-1 overflow-auto px-6 py-6 space-y-6">
              {/* Campaign Header */}
              <div className="flex items-start gap-4">
                <div className="p-4 bg-primary/10 rounded-xl">
                  <Megaphone className="h-8 w-8 text-primary" />
                </div>
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
                                <FormLabel className="text-sm font-semibold">Campaign Name *</FormLabel>
                                <FormControl>
                                  <Input
                                    placeholder="Campaign Name"
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
                            name="brand"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel className="text-sm font-semibold">Brand</FormLabel>
                                <FormControl>
                                  <Input
                                    placeholder="Brand Name"
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
                            name="budget"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel className="text-sm font-semibold">Budget *</FormLabel>
                                <FormControl>
                                  <Input
                                    type="number"
                                    step="0.01"
                                    placeholder="0.00"
                                    className="rounded-xl border-border/50 bg-background/60 backdrop-blur-sm"
                                    {...field}
                                    onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={form.control}
                            name="impressionGoal"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel className="text-sm font-semibold">Impression Goal *</FormLabel>
                                <FormControl>
                                  <Input
                                    type="number"
                                    placeholder="0"
                                    className="rounded-xl border-border/50 bg-background/60 backdrop-blur-sm"
                                    {...field}
                                    onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={form.control}
                            name="startDate"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel className="text-sm font-semibold">Start Date *</FormLabel>
                                <FormControl>
                                  <Input
                                    type="datetime-local"
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
                            name="endDate"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel className="text-sm font-semibold">End Date *</FormLabel>
                                <FormControl>
                                  <Input
                                    type="datetime-local"
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
                            name="campaignType"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel className="text-sm font-semibold">Campaign Type *</FormLabel>
                                <Select
                                  onValueChange={field.onChange}
                                  value={field.value}
                                >
                                  <FormControl>
                                    <SelectTrigger className="rounded-xl border-border/50 bg-background/60 backdrop-blur-sm">
                                      <SelectValue placeholder="Select type" />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    <SelectItem value="branding">Branding</SelectItem>
                                    <SelectItem value="conversion">Conversion</SelectItem>
                                  </SelectContent>
                                </Select>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={form.control}
                            name="vehicleTypeRequired"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel className="text-sm font-semibold">Vehicle Type *</FormLabel>
                                <Select
                                  onValueChange={field.onChange}
                                  value={field.value}
                                >
                                  <FormControl>
                                    <SelectTrigger className="rounded-xl border-border/50 bg-background/60 backdrop-blur-sm">
                                      <SelectValue placeholder="Select vehicle" />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    <SelectItem value="bike">Bike</SelectItem>
                                    <SelectItem value="e-bike">E-Bike</SelectItem>
                                    <SelectItem value="cargo-bike">Cargo Bike</SelectItem>
                                  </SelectContent>
                                </Select>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={form.control}
                            name="deliveryMode"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel className="text-sm font-semibold">Delivery Mode *</FormLabel>
                                <Select
                                  onValueChange={field.onChange}
                                  value={field.value}
                                >
                                  <FormControl>
                                    <SelectTrigger className="rounded-xl border-border/50 bg-background/60 backdrop-blur-sm">
                                      <SelectValue placeholder="Select mode" />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    <SelectItem value="manual">Manual</SelectItem>
                                    <SelectItem value="automated">Automated</SelectItem>
                                  </SelectContent>
                                </Select>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                        <FormField
                          control={form.control}
                          name="description"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-sm font-semibold">Description</FormLabel>
                              <FormControl>
                                <Textarea
                                  placeholder="Campaign description..."
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
                        <h2 className="text-2xl font-bold text-foreground">{campaign.name}</h2>
                        {getStatusBadge(campaign.status)}
                        {getTypeBadge(campaign.campaignType)}
                      </div>
                      {campaign.brand && (
                        <p className="text-lg text-muted-foreground mb-2">{campaign.brand}</p>
                      )}
                      {campaign.description && (
                        <p className="text-sm text-foreground">{campaign.description}</p>
                      )}
                    </>
                  )}
                </div>
              </div>

              <Separator />

              {/* Performance Metrics */}
              {!isEditMode && (
                <Card className="glass-card border-0">
                  <CardHeader className="pb-4">
                    <CardTitle className="text-lg font-bold">Performance Metrics</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div>
                        <p className="text-sm text-muted-foreground mb-1">Impressions</p>
                        <div className="flex items-center gap-2">
                          <Eye className="h-4 w-4 text-primary" />
                          <p className="text-lg font-bold text-foreground">
                            {campaign.impressions.toLocaleString()}
                          </p>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          Goal: {campaign.impressionGoal.toLocaleString()}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground mb-1">Clicks</p>
                        <div className="flex items-center gap-2">
                          <MousePointerClick className="h-4 w-4 text-blue-600" />
                          <p className="text-lg font-bold text-foreground">
                            {campaign.clicks.toLocaleString()}
                          </p>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          CTR: {campaign.ctr.toFixed(2)}%
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground mb-1">ROI</p>
                        <div className="flex items-center gap-2">
                          <TrendingUp className="h-4 w-4 text-green-600" />
                          <p className="text-lg font-bold text-foreground">
                            {campaign.roi.toFixed(2)}x
                          </p>
                        </div>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground mb-1">Progress</p>
                        <div className="flex items-center gap-2">
                          <Target className="h-4 w-4 text-primary" />
                          <p className="text-lg font-bold text-foreground">
                            {campaign.progress}%
                          </p>
                        </div>
                        <div className="w-full bg-muted rounded-full h-2 mt-2 overflow-hidden">
                          <div
                            className="bg-gradient-to-r from-primary to-primary/80 h-2 rounded-full transition-all duration-300"
                            style={{ width: `${campaign.progress}%` }}
                          ></div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Budget Information */}
              {!isEditMode && (
                <Card className="glass-card border-0">
                  <CardHeader className="pb-4">
                    <CardTitle className="text-lg font-bold">Budget Information</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm text-muted-foreground mb-1">Total Budget</p>
                        <div className="flex items-center gap-2">
                          <DollarSign className="h-4 w-4 text-primary" />
                          <p className="text-lg font-bold text-foreground">
                            ${campaign.budget.toLocaleString()}
                          </p>
                        </div>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground mb-1">Amount Spent</p>
                        <div className="flex items-center gap-2">
                          <DollarSign className="h-4 w-4 text-amber-600" />
                          <p className="text-lg font-bold text-foreground">
                            ${campaign.spent.toLocaleString()}
                          </p>
                        </div>
                      </div>
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-sm text-muted-foreground">Budget Utilization</p>
                        <p className="text-sm font-semibold text-foreground">
                          {budgetUtilization}%
                        </p>
                      </div>
                      <div className="w-full bg-muted rounded-full h-3 overflow-hidden">
                        <div
                          className="bg-gradient-to-r from-primary to-primary/80 h-3 rounded-full transition-all duration-300"
                          style={{ width: `${Math.min(100, budgetUtilization)}%` }}
                        ></div>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        ${(campaign.budget - campaign.spent).toLocaleString()} remaining
                      </p>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Campaign Details */}
              <Card className="glass-card border-0">
                <CardHeader className="pb-4">
                  <CardTitle className="text-lg font-bold">Campaign Details</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground mb-1">Campaign ID</p>
                      <div className="flex items-center gap-2">
                        <code className="text-sm font-mono bg-muted px-2 py-1 rounded">
                          {campaign.id}
                        </code>
                        <CopyButton value={campaign.id} />
                      </div>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground mb-1">Advertiser ID</p>
                      <code className="text-sm font-mono bg-muted px-2 py-1 rounded">
                        {campaign.advertiserId}
                      </code>
                    </div>
                    {!isEditMode && (
                      <>
                        <div>
                          <p className="text-sm text-muted-foreground mb-1">Start Date</p>
                          <div className="flex items-center gap-2">
                            <Calendar className="h-4 w-4 text-muted-foreground" />
                            <p className="text-sm font-medium text-foreground">
                              {format(startDate, "MMM d, yyyy 'at' h:mm a")}
                            </p>
                          </div>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground mb-1">End Date</p>
                          <div className="flex items-center gap-2">
                            <Calendar className="h-4 w-4 text-muted-foreground" />
                            <p className="text-sm font-medium text-foreground">
                              {format(endDate, "MMM d, yyyy 'at' h:mm a")}
                            </p>
                          </div>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground mb-1">Vehicle Type</p>
                          <div className="flex items-center gap-2">
                            <Bike className="h-4 w-4 text-primary" />
                            <p className="text-sm font-medium text-foreground capitalize">
                              {campaign.vehicleTypeRequired.replace("-", " ")}
                            </p>
                          </div>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground mb-1">Delivery Mode</p>
                          <Badge variant="outline" className="capitalize">
                            {campaign.deliveryMode}
                          </Badge>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground mb-1">Compliance Status</p>
                          <Badge
                            className={
                              campaign.complianceStatus === "approved"
                                ? "bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300"
                                : campaign.complianceStatus === "pending"
                                ? "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300"
                                : "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300"
                            }
                          >
                            {campaign.complianceStatus === "approved"
                              ? "Approved"
                              : campaign.complianceStatus === "pending"
                              ? "Pending"
                              : "Under Review"}
                          </Badge>
                        </div>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Target Zones */}
              {!isEditMode && campaign.targetZones && campaign.targetZones.length > 0 && (
                <Card className="glass-card border-0">
                  <CardHeader className="pb-4">
                    <CardTitle className="text-lg font-bold">Target Zones</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-2">
                      {campaign.targetZones.map((zone) => (
                        <Badge
                          key={zone}
                          variant="outline"
                          className="bg-primary/10 text-primary border-primary/20"
                        >
                          <MapPin className="h-3 w-3 mr-1" />
                          {zone}
                        </Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Riders & Routes */}
              {!isEditMode && (
                <Card className="glass-card border-0">
                  <CardHeader className="pb-4">
                    <CardTitle className="text-lg font-bold">Riders & Routes</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm text-muted-foreground mb-1">Riders Assigned</p>
                        <div className="flex items-center gap-2">
                          <Users className="h-4 w-4 text-primary" />
                          <p className="text-sm font-medium text-foreground">
                            {campaign.ridersAssigned?.length || 0} riders
                          </p>
                        </div>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground mb-1">Routes</p>
                        <div className="flex items-center gap-2">
                          <Target className="h-4 w-4 text-primary" />
                          <p className="text-sm font-medium text-foreground">
                            {campaign.routes?.length || 0} routes
                          </p>
                        </div>
                      </div>
                    </div>
                    {campaign.routes && campaign.routes.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-sm font-semibold text-foreground">Route Details</p>
                        <div className="space-y-1">
                          {campaign.routes.map((route) => (
                            <div
                              key={route.id}
                              className="flex items-center justify-between p-2 bg-muted/30 rounded-lg"
                            >
                              <span className="text-sm text-foreground">{route.name}</span>
                              <Badge
                                variant="outline"
                                className={
                                  route.status === "active"
                                    ? "bg-green-50 text-green-700 border-green-200"
                                    : "bg-amber-50 text-amber-700 border-amber-200"
                                }
                              >
                                {route.status}
                              </Badge>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Activity Timeline */}
              {!isEditMode && (
                <Card className="glass-card border-0">
                  <CardHeader className="pb-4">
                    <CardTitle className="text-lg font-bold">Activity Timeline</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm text-muted-foreground mb-1">Created</p>
                        <div className="flex items-center gap-2">
                          <Clock className="h-4 w-4 text-muted-foreground" />
                          <p className="text-sm font-medium text-foreground">
                            {format(new Date(campaign.createdAt), "MMM d, yyyy 'at' h:mm a")}
                          </p>
                        </div>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground mb-1">Last Updated</p>
                        <div className="flex items-center gap-2">
                          <Clock className="h-4 w-4 text-muted-foreground" />
                          <p className="text-sm font-medium text-foreground">
                            {format(new Date(campaign.updatedAt), "MMM d, yyyy 'at' h:mm a")}
                          </p>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Footer Actions */}
            <div className="px-6 py-4 border-t glass-card border-0 flex justify-between items-center bg-background/50 backdrop-blur-sm">
              <div className="flex gap-2 flex-wrap">
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
                    {campaign.status === "draft" && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleStatusChange("active")}
                        disabled={isLoading}
                      >
                        <PlayCircle className="mr-2 h-4 w-4" />
                        Activate
                      </Button>
                    )}
                    {campaign.status === "active" && (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleStatusChange("paused")}
                          disabled={isLoading}
                        >
                          <PauseCircle className="mr-2 h-4 w-4" />
                          Pause
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleStatusChange("completed")}
                          disabled={isLoading}
                        >
                          <CheckCircle2 className="mr-2 h-4 w-4" />
                          Complete
                        </Button>
                      </>
                    )}
                    {campaign.status === "paused" && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleStatusChange("active")}
                        disabled={isLoading}
                      >
                        <PlayCircle className="mr-2 h-4 w-4" />
                        Resume
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowRunSelectionDialog(true)}
                      disabled={isLoading || campaign.status === "completed" || campaign.status === "cancelled"}
                    >
                      <RefreshCw className="mr-2 h-4 w-4" />
                      Run Selection
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowDuplicateDialog(true)}
                      disabled={isLoading}
                    >
                      <Copy className="mr-2 h-4 w-4" />
                      Duplicate
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

      {/* Run Selection Dialog */}
      <AlertDialog open={showRunSelectionDialog} onOpenChange={setShowRunSelectionDialog}>
        <AlertDialogContent className="glass-card border-0 backdrop-blur-xl">
          <AlertDialogHeader>
            <div className="flex items-center gap-3 mb-2">
              <div className="p-3 bg-primary/10 rounded-xl">
                <RefreshCw className="h-6 w-6 text-primary" />
              </div>
              <AlertDialogTitle className="text-xl font-bold">
                Run Campaign Selection
              </AlertDialogTitle>
            </div>
            <AlertDialogDescription className="text-muted-foreground">
              This will run the selection process for{" "}
              <span className="font-semibold text-foreground">{campaign.name}</span>.
              Riders will be selected based on the configured selection strategy.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4">
            <div className="flex items-start gap-3 p-4 bg-muted/30 rounded-xl border border-border/50">
              <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5 flex-shrink-0" />
              <div className="space-y-1">
                <p className="text-sm font-semibold text-foreground">
                  What happens next?
                </p>
                <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                  <li>Selection algorithm will process all signups</li>
                  <li>Riders will be selected based on capacity and strategy</li>
                  <li>Selected riders will be notified</li>
                  <li>Rejected riders will receive a notification</li>
                </ul>
              </div>
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isRunningSelection}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRunSelection}
              disabled={isRunningSelection}
              className="bg-primary hover:bg-primary/90 text-primary-foreground"
            >
              {isRunningSelection && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isRunningSelection ? "Running..." : "Run Selection"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Campaign Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent className="glass-card border-0 backdrop-blur-xl">
          <AlertDialogHeader>
            <div className="flex items-center gap-3 mb-2">
              <div className="p-3 bg-red-100 dark:bg-red-950 rounded-xl">
                <Trash2 className="h-6 w-6 text-red-600 dark:text-red-400" />
              </div>
              <AlertDialogTitle className="text-xl font-bold text-destructive">
                Delete Campaign
              </AlertDialogTitle>
            </div>
            <AlertDialogDescription className="text-muted-foreground">
              Are you sure you want to delete{" "}
              <span className="font-semibold text-foreground">{campaign.name}</span>? This action
              cannot be undone and will permanently remove the campaign and all associated data.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4">
            <div className="flex items-start gap-3 p-4 bg-red-50 dark:bg-red-950/30 rounded-xl border border-red-200 dark:border-red-800">
              <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" />
              <div className="space-y-1">
                <p className="text-sm font-semibold text-red-900 dark:text-red-100">
                  Warning: This action is irreversible
                </p>
                <ul className="text-sm text-red-700 dark:text-red-300 space-y-1 list-disc list-inside">
                  <li>Campaign will be permanently deleted</li>
                  <li>All associated routes and assignments will be removed</li>
                  <li>Performance data will be lost</li>
                </ul>
              </div>
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isLoading}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isLoading}
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
            >
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isLoading ? "Deleting..." : "Delete Campaign"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Duplicate Campaign Dialog */}
      <AlertDialog open={showDuplicateDialog} onOpenChange={setShowDuplicateDialog}>
        <AlertDialogContent className="glass-card border-0 backdrop-blur-xl">
          <AlertDialogHeader>
            <div className="flex items-center gap-3 mb-2">
              <div className="p-3 bg-primary/10 rounded-xl">
                <Copy className="h-6 w-6 text-primary" />
              </div>
              <AlertDialogTitle className="text-xl font-bold">
                Duplicate Campaign
              </AlertDialogTitle>
            </div>
            <AlertDialogDescription className="text-muted-foreground">
              This will create a copy of{" "}
              <span className="font-semibold text-foreground">{campaign.name}</span> with all
              settings. The new campaign will be created as a draft.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isLoading}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDuplicate}
              disabled={isLoading}
              className="bg-primary hover:bg-primary/90 text-primary-foreground"
            >
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isLoading ? "Duplicating..." : "Duplicate Campaign"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
