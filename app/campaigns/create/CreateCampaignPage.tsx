"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Loader2,
  ArrowLeft,
  Plus,
  Info,
  Calendar,
  DollarSign,
  Target,
  MapPin,
  Settings,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
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
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { PageHeader } from "@/components/PageHeader";
import { useToast } from "@/hooks/useToast";
import { createCampaign } from "@/app/actions/campaigns";
import { MultiSelect } from "@/components/ui/multi-select";
import { useRouteData } from "@/hooks/useRouteData";
import { useUsersData } from "@/hooks/useUsersData";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";

const createCampaignFormSchema = z
  .object({
    name: z
      .string()
      .min(1, "Campaign name is required")
      .max(100, "Campaign name must be less than 100 characters"),
    brand: z.string().optional(),
    description: z.string().optional(),
    budget: z.number().min(0.01, "Budget must be greater than 0"),
    startDate: z.string().min(1, "Start date is required"),
    endDate: z.string().min(1, "End date is required"),
    impressionGoal: z.number().min(1, "Impression goal must be at least 1"),
    campaignType: z.enum(["destination_ride", "swarm"]),
    targetZones: z.array(z.string()).optional(),
    vehicleTypeRequired: z.enum(["bike", "e-bike", "cargo-bike"]),
    deliveryMode: z.enum(["manual", "automated"]),
    advertiserId: z.string().min(1, "Advertiser is required"),
    routeIds: z.array(z.string()).min(1, "At least one route is required"),
  })
  .refine(
    (data) => {
      if (!data.startDate || !data.endDate) return true;
      return new Date(data.endDate) > new Date(data.startDate);
    },
    {
      message: "End date must be after start date",
      path: ["endDate"],
    },
  );

type CreateCampaignFormData = z.infer<typeof createCampaignFormSchema>;

// Available zones (should come from API in production)
const availableZones = [
  { value: "Amsterdam", label: "Amsterdam" },
  { value: "Rotterdam", label: "Rotterdam" },
  { value: "Utrecht", label: "Utrecht" },
  { value: "The Hague", label: "The Hague" },
  { value: "Eindhoven", label: "Eindhoven" },
  { value: "Groningen", label: "Groningen" },
  { value: "Tilburg", label: "Tilburg" },
  { value: "Almere", label: "Almere" },
];

export default function CreateCampaignPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [formStep, setFormStep] = useState<"basic" | "targeting" | "review">(
    "basic",
  );

  // Fetch routes and users data
  const { data: routes = [], isLoading: routesLoading } = useRouteData();
  const { data: users = [], isLoading: usersLoading } = useUsersData();

  // Filter advertisers from users
  const advertisers = useMemo(() => {
    return users.filter((user) => user.role === "advertiser");
  }, [users]);

  // Prepare route options
  const routeOptions = useMemo(() => {
    return routes.map((route) => ({
      value: route.id,
      label: route.name || `Route ${route.id.slice(0, 8)}`,
    }));
  }, [routes]);

  const form = useForm<CreateCampaignFormData>({
    resolver: zodResolver(createCampaignFormSchema),
    defaultValues: {
      name: "",
      brand: "",
      description: "",
      budget: 0,
      startDate: "",
      endDate: "",
      impressionGoal: 0,
      campaignType: "destination_ride",
      targetZones: [],
      vehicleTypeRequired: "bike",
      deliveryMode: "manual",
      advertiserId: "",
      routeIds: [],
    },
    mode: "onChange",
  });

  const watchedValues = form.watch();

  // Calculate estimated duration
  const estimatedDuration = useMemo(() => {
    if (watchedValues.startDate && watchedValues.endDate) {
      const start = new Date(watchedValues.startDate);
      const end = new Date(watchedValues.endDate);
      const diffTime = Math.abs(end.getTime() - start.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      return diffDays;
    }
    return 0;
  }, [watchedValues.startDate, watchedValues.endDate]);

  // Calculate cost per impression
  const costPerImpression = useMemo(() => {
    if (watchedValues.budget > 0 && watchedValues.impressionGoal > 0) {
      return (watchedValues.budget / watchedValues.impressionGoal).toFixed(4);
    }
    return "0.0000";
  }, [watchedValues.budget, watchedValues.impressionGoal]);

  const onSubmit = async (data: CreateCampaignFormData) => {
    setIsLoading(true);
    try {
      // Convert datetime-local format to ISO string
      const startDateISO = new Date(data.startDate).toISOString();
      const endDateISO = new Date(data.endDate).toISOString();

      const result = await createCampaign({
        name: data.name,
        description: data.description,
        budget: data.budget,
        startDate: startDateISO,
        endDate: endDateISO,
        routeIds: data.routeIds,
        advertiserId: data.advertiserId,
        campaignType: data.campaignType,
        targetZones: data.targetZones,
        vehicleTypeRequired: data.vehicleTypeRequired,
        deliveryMode: data.deliveryMode,
        impressionGoal: data.impressionGoal,
      });

      if (!result.success) {
        throw new Error(result.error || "Failed to create campaign");
      }

      toast({
        title: "Campaign Created Successfully",
        description: `Campaign "${data.name}" has been created and is ready for review.`,
      });

      router.push("/campaigns");
    } catch (error) {
      toast({
        title: "Creation Failed",
        description:
          error instanceof Error
            ? error.message
            : "Failed to create campaign. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const selectedAdvertiser = advertisers.find(
    (a) => a.id === watchedValues.advertiserId,
  );
  const selectedRoutes = routes.filter((r) =>
    watchedValues.routeIds.includes(r.id),
  );

  return (
    <div className="min-h-screen gradient-bg px-4 sm:px-6 py-8 md:py-12 lg:py-16 lg:pt-6">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <PageHeader
          title="Create New Campaign"
          description="Set up a new advertising campaign with comprehensive details and targeting options"
          action={{
            label: "Back to Campaigns",
            href: "/campaigns",
            icon: <ArrowLeft className="h-4 w-4" />,
            asChild: true,
          }}
        />

        {/* Progress Indicator */}
        <Card className="glass-card border-0">
          <CardContent className="flex items-center justify-between pt-6">
            {[
              { key: "basic", label: "Basic Info", icon: Info },
              { key: "targeting", label: "Targeting", icon: Target },
              { key: "review", label: "Review", icon: CheckCircle2 },
            ].map((step, index) => {
              const StepIcon = step.icon;
              const isActive = formStep === step.key;
              const isCompleted =
                (formStep === "targeting" && step.key === "basic") ||
                (formStep === "review" &&
                  ["basic", "targeting"].includes(step.key));

              return (
                <div key={step.key} className="flex items-center flex-1">
                  <div className="flex flex-col items-center flex-1">
                    <div
                      className={`flex items-center justify-center w-10 h-10 rounded-full border-2 transition-all ${
                        isActive
                          ? "border-primary bg-primary text-primary-foreground"
                          : isCompleted
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-muted bg-muted text-muted-foreground"
                      }`}
                    >
                      <StepIcon className="h-5 w-5" />
                    </div>
                    <span
                      className={`mt-2 text-xs font-medium ${
                        isActive ? "text-primary" : "text-muted-foreground"
                      }`}
                    >
                      {step.label}
                    </span>
                  </div>
                  {index < 2 && (
                    <div
                      className={`flex-1 h-0.5 mx-4 transition-all ${
                        isCompleted ? "bg-primary" : "bg-muted"
                      }`}
                    />
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* Campaign Form */}
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* Basic Information Section */}
            {(formStep === "basic" ||
              formStep === "targeting" ||
              formStep === "review") && (
              <Card className="glass-card border-0 animate-slide-up">
                <CardHeader>
                  <div>
                    <CardTitle className="text-xl font-bold">
                      Basic Information
                    </CardTitle>
                    <CardDescription>
                      Essential details about your campaign
                    </CardDescription>
                  </div>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-sm font-semibold flex items-center gap-2">
                            Campaign Name{" "}
                            <span className="text-destructive">*</span>
                          </FormLabel>
                          <FormControl>
                            <Input
                              placeholder="Enter campaign name"
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
                          <FormLabel className="text-sm font-semibold">
                            Brand
                          </FormLabel>
                          <FormControl>
                            <Input
                              placeholder="Brand name (optional)"
                              className="rounded-xl border-border/50 bg-background/60 backdrop-blur-sm"
                              {...field}
                            />
                          </FormControl>
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
                        <FormLabel className="text-sm font-semibold">
                          Description
                        </FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Describe your campaign goals and objectives..."
                            className="rounded-xl border-border/50 bg-background/60 backdrop-blur-sm min-h-[100px] resize-none"
                            {...field}
                          />
                        </FormControl>
                        <FormDescription className="text-xs">
                          Provide a detailed description of your campaign
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="campaignType"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-sm font-semibold flex items-center gap-2">
                            Campaign Type{" "}
                            <span className="text-destructive">*</span>
                          </FormLabel>
                          <Select
                            onValueChange={field.onChange}
                            defaultValue={field.value}
                          >
                            <FormControl>
                              <SelectTrigger className="w-full rounded-xl border-border/50 bg-background/60 backdrop-blur-sm">
                                <SelectValue placeholder="Select type" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="branding">
                                <div className="flex flex-col">
                                  <span className="font-medium self-start">
                                    Branding
                                  </span>
                                  <span className="text-xs text-muted-foreground">
                                    Increase brand awareness
                                  </span>
                                </div>
                              </SelectItem>
                              <SelectItem value="conversion">
                                <div className="flex flex-col">
                                  <span className="font-medium">
                                    Conversion
                                  </span>
                                  <span className="text-xs text-muted-foreground">
                                    Drive specific actions
                                  </span>
                                </div>
                              </SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="advertiserId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-sm font-semibold flex items-center gap-2">
                            Advertiser{" "}
                            <span className="text-destructive">*</span>
                          </FormLabel>
                          <Select
                            onValueChange={field.onChange}
                            value={field.value}
                            disabled={usersLoading}
                          >
                            <FormControl>
                              <SelectTrigger className="w-full rounded-xl border-border/50 bg-background/60 backdrop-blur-sm">
                                <SelectValue
                                  placeholder={
                                    usersLoading
                                      ? "Loading..."
                                      : "Select advertiser"
                                  }
                                />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {advertisers.map((advertiser) => (
                                <SelectItem
                                  key={advertiser.id}
                                  value={advertiser.id}
                                >
                                  <div className="flex flex-col">
                                    <span className="font-medium self-start">
                                      {advertiser.name}
                                    </span>
                                    <span className="text-xs text-muted-foreground">
                                      {advertiser.email}
                                    </span>
                                  </div>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Budget & Timeline Section */}
            {(formStep === "basic" ||
              formStep === "targeting" ||
              formStep === "review") && (
              <Card
                className="glass-card border-0 animate-slide-up"
                style={{ animationDelay: "0.1s" }}
              >
                <CardHeader>
                  <div>
                    <CardTitle className="text-xl font-bold">
                      Budget & Timeline
                    </CardTitle>
                    <CardDescription>
                      Set your budget and campaign duration
                    </CardDescription>
                  </div>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="budget"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-sm font-semibold flex items-center gap-2">
                            Budget (€){" "}
                            <span className="text-destructive">*</span>
                          </FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              step="0.01"
                              min="0.01"
                              placeholder="0.00"
                              className="rounded-xl border-border/50 bg-background/60 backdrop-blur-sm"
                              {...field}
                              onChange={(e) =>
                                field.onChange(parseFloat(e.target.value) || 0)
                              }
                            />
                          </FormControl>
                          <FormDescription className="text-xs">
                            Total budget allocated for this campaign
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="impressionGoal"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-sm font-semibold flex items-center gap-2">
                            Impression Goal{" "}
                            <span className="text-destructive">*</span>
                          </FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              min="1"
                              placeholder="0"
                              className="rounded-xl border-border/50 bg-background/60 backdrop-blur-sm"
                              {...field}
                              onChange={(e) =>
                                field.onChange(parseInt(e.target.value) || 0)
                              }
                            />
                          </FormControl>
                          <FormDescription className="text-xs">
                            Target number of impressions
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  {watchedValues.budget > 0 &&
                    watchedValues.impressionGoal > 0 && (
                      <Alert>
                        <Info className="h-4 w-4" />
                        <AlertDescription>
                          <div className="flex items-center justify-between">
                            <span>Estimated cost per impression:</span>
                            <Badge variant="outline" className="font-semibold">
                              €{costPerImpression}
                            </Badge>
                          </div>
                        </AlertDescription>
                      </Alert>
                    )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="startDate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-sm font-semibold flex items-center gap-2">
                            Start Date{" "}
                            <span className="text-destructive">*</span>
                          </FormLabel>
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
                          <FormLabel className="text-sm font-semibold flex items-center gap-2">
                            End Date <span className="text-destructive">*</span>
                          </FormLabel>
                          <FormControl>
                            <Input
                              type="datetime-local"
                              className="rounded-xl border-border/50 bg-background/60 backdrop-blur-sm"
                              min={watchedValues.startDate || undefined}
                              {...field}
                            />
                          </FormControl>
                          {estimatedDuration > 0 && (
                            <FormDescription className="text-xs">
                              Duration: {estimatedDuration} day
                              {estimatedDuration !== 1 ? "s" : ""}
                            </FormDescription>
                          )}
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Targeting & Configuration Section */}
            {(formStep === "targeting" || formStep === "review") && (
              <>
                <Card
                  className="glass-card border-0 animate-slide-up"
                  style={{ animationDelay: "0.2s" }}
                >
                  <CardHeader>
                    <div>
                      <CardTitle className="text-xl font-bold">
                        Targeting & Configuration
                      </CardTitle>
                      <CardDescription>
                        Define your target audience and delivery settings
                      </CardDescription>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="targetZones"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-sm font-semibold">
                              Target Zones
                            </FormLabel>
                            <FormControl>
                              <MultiSelect
                                options={availableZones}
                                selected={field.value || []}
                                onChange={field.onChange}
                                placeholder="Select zones..."
                                className="w-full"
                              />
                            </FormControl>
                            <FormDescription className="text-xs">
                              Select one or more target zones for this campaign
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="vehicleTypeRequired"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-sm font-semibold flex items-center gap-2">
                              Vehicle Type{" "}
                              <span className="text-destructive">*</span>
                            </FormLabel>
                            <Select
                              onValueChange={field.onChange}
                              defaultValue={field.value}
                            >
                              <FormControl>
                                <SelectTrigger className="w-full rounded-xl border-border/50 bg-background/60 backdrop-blur-sm">
                                  <SelectValue placeholder="Select vehicle" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="bike">Bike</SelectItem>
                                <SelectItem value="e-bike">E-Bike</SelectItem>
                                <SelectItem value="cargo-bike">
                                  Cargo Bike
                                </SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="routeIds"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-sm font-semibold flex items-center gap-2">
                              Routes <span className="text-destructive">*</span>
                            </FormLabel>
                            <FormControl>
                              <MultiSelect
                                options={routeOptions}
                                selected={field.value || []}
                                onChange={field.onChange}
                                placeholder={
                                  routesLoading
                                    ? "Loading routes..."
                                    : "Select routes..."
                                }
                                className="w-full"
                              />
                            </FormControl>
                            <FormDescription className="text-xs">
                              Select at least one route for this campaign
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="deliveryMode"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-sm font-semibold flex items-center gap-2">
                              Delivery Mode{" "}
                              <span className="text-destructive">*</span>
                            </FormLabel>
                            <Select
                              onValueChange={field.onChange}
                              defaultValue={field.value}
                            >
                              <FormControl>
                                <SelectTrigger className="w-full rounded-xl border-border/50 bg-background/60 backdrop-blur-sm">
                                  <SelectValue placeholder="Select mode" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="manual">
                                  <div className="flex flex-col">
                                    <span className="font-medium self-start">
                                      Manual
                                    </span>
                                    <span className="text-xs text-muted-foreground">
                                      Manual campaign management
                                    </span>
                                  </div>
                                </SelectItem>
                                <SelectItem value="automated">
                                  <div className="flex flex-col">
                                    <span className="font-medium">
                                      Automated
                                    </span>
                                    <span className="text-xs text-muted-foreground">
                                      Automated campaign delivery
                                    </span>
                                  </div>
                                </SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </CardContent>
                </Card>
              </>
            )}

            {/* Review Section */}
            {formStep === "review" && (
              <Card
                className="glass-card border-0 animate-slide-up"
                style={{ animationDelay: "0.3s" }}
              >
                <CardHeader>
                  <div>
                    <CardTitle className="text-xl font-bold">
                      Review & Confirm
                    </CardTitle>
                    <CardDescription>
                      Review your campaign details before creating
                    </CardDescription>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <p className="text-sm font-semibold text-muted-foreground">
                        Campaign Name
                      </p>
                      <p className="text-base font-medium">
                        {watchedValues.name || "—"}
                      </p>
                    </div>
                    <div className="space-y-2">
                      <p className="text-sm font-semibold text-muted-foreground">
                        Campaign Type
                      </p>
                      <Badge variant="outline" className="capitalize">
                        {watchedValues.campaignType}
                      </Badge>
                    </div>
                    <div className="space-y-2">
                      <p className="text-sm font-semibold text-muted-foreground">
                        Advertiser
                      </p>
                      <p className="text-base font-medium">
                        {selectedAdvertiser?.name || "—"}
                      </p>
                    </div>
                    <div className="space-y-2">
                      <p className="text-sm font-semibold text-muted-foreground">
                        Budget
                      </p>
                      <p className="text-base font-medium">
                        €{watchedValues.budget.toLocaleString()}
                      </p>
                    </div>
                    <div className="space-y-2">
                      <p className="text-sm font-semibold text-muted-foreground">
                        Impression Goal
                      </p>
                      <p className="text-base font-medium">
                        {watchedValues.impressionGoal.toLocaleString()}
                      </p>
                    </div>
                    <div className="space-y-2">
                      <p className="text-sm font-semibold text-muted-foreground">
                        Duration
                      </p>
                      <p className="text-base font-medium">
                        {estimatedDuration} day
                        {estimatedDuration !== 1 ? "s" : ""}
                      </p>
                    </div>
                    <div className="space-y-2">
                      <p className="text-sm font-semibold text-muted-foreground">
                        Vehicle Type
                      </p>
                      <Badge variant="outline" className="capitalize">
                        {watchedValues.vehicleTypeRequired?.replace("-", " ") ||
                          "—"}
                      </Badge>
                    </div>
                    <div className="space-y-2">
                      <p className="text-sm font-semibold text-muted-foreground">
                        Delivery Mode
                      </p>
                      <Badge variant="outline" className="capitalize">
                        {watchedValues.deliveryMode || "—"}
                      </Badge>
                    </div>
                    <div className="space-y-2">
                      <p className="text-sm font-semibold text-muted-foreground">
                        Target Zones
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {watchedValues.targetZones &&
                        watchedValues.targetZones.length > 0 ? (
                          watchedValues.targetZones.map((zone) => (
                            <Badge key={zone} variant="secondary">
                              {zone}
                            </Badge>
                          ))
                        ) : (
                          <span className="text-muted-foreground">
                            None selected
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <p className="text-sm font-semibold text-muted-foreground">
                        Routes
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {selectedRoutes.length > 0 ? (
                          selectedRoutes.map((route) => (
                            <Badge key={route.id} variant="secondary">
                              {route.name || `Route ${route.id.slice(0, 8)}`}
                            </Badge>
                          ))
                        ) : (
                          <span className="text-muted-foreground">
                            No routes selected
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Form Actions */}
            <div className="flex justify-between items-center gap-3 pt-4 border-t">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  if (formStep === "targeting") {
                    setFormStep("basic");
                  } else if (formStep === "review") {
                    setFormStep("targeting");
                  } else {
                    router.back();
                  }
                }}
                disabled={isLoading}
              >
                {formStep === "basic" ? "Cancel" : "Back"}
              </Button>
              <div className="flex gap-3">
                {formStep !== "review" && (
                  <Button
                    type="button"
                    onClick={() => {
                      if (formStep === "basic") {
                        // Validate basic fields before proceeding
                        form.trigger([
                          "name",
                          "budget",
                          "startDate",
                          "endDate",
                          "impressionGoal",
                          "advertiserId",
                        ]);
                        const basicErrors = form.formState.errors;
                        if (
                          !basicErrors.name &&
                          !basicErrors.budget &&
                          !basicErrors.startDate &&
                          !basicErrors.endDate &&
                          !basicErrors.impressionGoal &&
                          !basicErrors.advertiserId
                        ) {
                          setFormStep("targeting");
                        }
                      } else if (formStep === "targeting") {
                        // Validate targeting fields before proceeding
                        form.trigger(["routeIds"]);
                        const targetingErrors = form.formState.errors;
                        if (!targetingErrors.routeIds) {
                          setFormStep("review");
                        }
                      }
                    }}
                    className="bg-primary hover:bg-primary/90 text-primary-foreground"
                  >
                    Next
                  </Button>
                )}
                {formStep === "review" && (
                  <Button
                    type="submit"
                    disabled={isLoading}
                    className="bg-primary hover:bg-primary/90 text-primary-foreground"
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Creating...
                      </>
                    ) : (
                      <>
                        <Plus className="mr-2 h-4 w-4" />
                        Create Campaign
                      </>
                    )}
                  </Button>
                )}
              </div>
            </div>
          </form>
        </Form>
      </div>
    </div>
  );
}
