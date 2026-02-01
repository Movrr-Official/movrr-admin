"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Loader2,
  ArrowLeft,
  UserPlus,
  User,
  Mail,
  Phone,
  Shield,
  Building2,
  Globe,
  FileText,
  CheckCircle2,
  AlertCircle,
  Info,
  Settings,
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
import { Checkbox } from "@/components/ui/checkbox";
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
import { createUser } from "@/app/actions/users";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";

const createUserFormSchema = z.object({
  email: z.string().email("Invalid email address").min(1, "Email is required"),
  name: z
    .string()
    .min(1, "Full name is required")
    .max(100, "Name must be less than 100 characters"),
  phone: z.string().optional(),
  role: z.enum([
    "admin",
    "super_admin",
    "moderator",
    "support",
    "advertiser",
    "rider",
    "government",
  ]),
  status: z.enum(["active", "inactive", "pending"]),
  organization: z.string().optional(),
  languagePreference: z.string().default("en"),
  isVerified: z.boolean().default(false),
  accountNotes: z.string().optional(),
  sendWelcomeEmail: z.boolean().default(true),
});

type CreateUserFormData = z.infer<typeof createUserFormSchema>;

const roleDescriptions: Record<string, string> = {
  admin: "Administrator with full system access",
  super_admin: "Super administrator with elevated privileges",
  moderator: "Content and user moderation access",
  support: "Customer support and assistance access",
  advertiser: "Campaign creation and management access",
  rider: "Rider with route and campaign participation",
  government: "Government or regulatory access",
};

const languageOptions = [
  { value: "en", label: "English" },
  { value: "nl", label: "Dutch" },
  { value: "de", label: "German" },
  { value: "fr", label: "French" },
  { value: "es", label: "Spanish" },
];

export default function CreateUserPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [formStep, setFormStep] = useState<"basic" | "details" | "review">(
    "basic",
  );

  const form = useForm<CreateUserFormData>({
    resolver: zodResolver(createUserFormSchema),
    defaultValues: {
      email: "",
      name: "",
      phone: "",
      role: "rider",
      status: "active",
      organization: "",
      languagePreference: "en",
      isVerified: false,
      accountNotes: "",
      sendWelcomeEmail: true,
    },
    mode: "onChange",
  });

  const watchedValues = form.watch();

  const onSubmit = async (data: CreateUserFormData) => {
    setIsLoading(true);
    try {
      const result = await createUser(data);

      if (!result.success) {
        throw new Error(result.error || "Failed to create user");
      }

      toast({
        title: "User Created Successfully",
        description: `User "${data.name}" has been created and is ready to use.`,
      });

      router.push("/users");
    } catch (error) {
      toast({
        title: "Creation Failed",
        description:
          error instanceof Error
            ? error.message
            : "Failed to create user. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const selectedRoleDescription = roleDescriptions[watchedValues.role] || "";

  return (
    <div className="min-h-screen gradient-bg px-4 sm:px-6 py-8 md:py-12 lg:py-16 lg:pt-6">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <PageHeader
          title="Create New User"
          description="Add a new user to the platform with appropriate role and permissions"
          action={{
            label: "Back to Users",
            href: "/users",
            icon: <ArrowLeft className="h-4 w-4" />,
            asChild: true,
          }}
        />

        {/* Progress Indicator */}
        <Card className="glass-card border-0">
          <CardContent className="flex items-center justify-between pt-6">
            {[
              { key: "basic", label: "Basic Info", icon: User },
              { key: "details", label: "Details", icon: Settings },
              { key: "review", label: "Review", icon: CheckCircle2 },
            ].map((step, index) => {
              const StepIcon = step.icon;
              const isActive = formStep === step.key;
              const isCompleted =
                (formStep === "details" && step.key === "basic") ||
                (formStep === "review" &&
                  ["basic", "details"].includes(step.key));

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

        {/* User Form */}
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* Basic Information Section */}
            {(formStep === "basic" ||
              formStep === "details" ||
              formStep === "review") && (
              <Card className="glass-card border-0 animate-slide-up">
                <CardHeader>
                  <div>
                    <CardTitle className="text-xl font-bold">
                      Basic Information
                    </CardTitle>
                    <CardDescription>
                      Essential user account details
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
                            Full Name{" "}
                            <span className="text-destructive">*</span>
                          </FormLabel>
                          <FormControl>
                            <Input
                              placeholder="Enter full name"
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
                          <FormLabel className="text-sm font-semibold flex items-center gap-2">
                            Email Address{" "}
                            <span className="text-destructive">*</span>
                          </FormLabel>
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
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="phone"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-sm font-semibold">
                            Phone Number
                          </FormLabel>
                          <FormControl>
                            <Input
                              type="tel"
                              placeholder="+31 6 12345678"
                              className="rounded-xl border-border/50 bg-background/60 backdrop-blur-sm"
                              {...field}
                            />
                          </FormControl>
                          <FormDescription className="text-xs">
                            Optional contact number
                          </FormDescription>
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
                              placeholder="Company or organization name"
                              className="rounded-xl border-border/50 bg-background/60 backdrop-blur-sm"
                              {...field}
                            />
                          </FormControl>
                          <FormDescription className="text-xs">
                            Optional organization affiliation
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Role & Access Section */}
            {(formStep === "details" || formStep === "review") && (
              <Card
                className="glass-card border-0 animate-slide-up"
                style={{ animationDelay: "0.1s" }}
              >
                <CardHeader>
                  <div>
                    <CardTitle className="text-xl font-bold">
                      Role & Access
                    </CardTitle>
                    <CardDescription>
                      Define user role and access permissions
                    </CardDescription>
                  </div>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="role"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-sm font-semibold flex items-center gap-2">
                            User Role{" "}
                            <span className="text-destructive">*</span>
                          </FormLabel>
                          <Select
                            onValueChange={field.onChange}
                            defaultValue={field.value}
                          >
                            <FormControl>
                              <SelectTrigger className="w-full rounded-xl border-border/50 bg-background/60 backdrop-blur-sm">
                                <SelectValue placeholder="Select role" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="rider">
                                <div className="flex flex-col">
                                  <span className="font-medium self-start">
                                    Rider
                                  </span>
                                  <span className="text-xs text-muted-foreground">
                                    {roleDescriptions.rider}
                                  </span>
                                </div>
                              </SelectItem>
                              <SelectItem value="advertiser">
                                <div className="flex flex-col">
                                  <span className="font-medium self-start">
                                    Advertiser
                                  </span>
                                  <span className="text-xs text-muted-foreground">
                                    {roleDescriptions.advertiser}
                                  </span>
                                </div>
                              </SelectItem>
                              <SelectItem value="admin">
                                <div className="flex flex-col">
                                  <span className="font-medium self-start">
                                    Admin
                                  </span>
                                  <span className="text-xs text-muted-foreground">
                                    {roleDescriptions.admin}
                                  </span>
                                </div>
                              </SelectItem>
                              <SelectItem value="super-admin">
                                <div className="flex flex-col">
                                  <span className="font-medium self-start">
                                    Super Admin
                                  </span>
                                  <span className="text-xs text-muted-foreground">
                                    {roleDescriptions["super-admin"]}
                                  </span>
                                </div>
                              </SelectItem>
                              <SelectItem value="moderator">
                                <div className="flex flex-col">
                                  <span className="font-medium self-start">
                                    Moderator
                                  </span>
                                  <span className="text-xs text-muted-foreground">
                                    {roleDescriptions.moderator}
                                  </span>
                                </div>
                              </SelectItem>
                              <SelectItem value="support">
                                <div className="flex flex-col">
                                  <span className="font-medium self-start">
                                    Support
                                  </span>
                                  <span className="text-xs text-muted-foreground">
                                    {roleDescriptions.support}
                                  </span>
                                </div>
                              </SelectItem>
                              <SelectItem value="government">
                                <div className="flex flex-col">
                                  <span className="font-medium self-start">
                                    Government
                                  </span>
                                  <span className="text-xs text-muted-foreground">
                                    {roleDescriptions.government}
                                  </span>
                                </div>
                              </SelectItem>
                            </SelectContent>
                          </Select>
                          {selectedRoleDescription && (
                            <FormDescription className="text-xs">
                              {selectedRoleDescription}
                            </FormDescription>
                          )}
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="status"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-sm font-semibold flex items-center gap-2">
                            Account Status{" "}
                            <span className="text-destructive">*</span>
                          </FormLabel>
                          <Select
                            onValueChange={field.onChange}
                            defaultValue={field.value}
                          >
                            <FormControl>
                              <SelectTrigger className="w-full rounded-xl border-border/50 bg-background/60 backdrop-blur-sm">
                                <SelectValue placeholder="Select status" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="active">
                                <div className="flex flex-col">
                                  <span className="font-medium self-start">
                                    Active
                                  </span>
                                  <span className="text-xs text-muted-foreground">
                                    User can access the platform
                                  </span>
                                </div>
                              </SelectItem>
                              <SelectItem value="pending">
                                <div className="flex flex-col">
                                  <span className="font-medium self-start">
                                    Pending
                                  </span>
                                  <span className="text-xs text-muted-foreground">
                                    Awaiting activation
                                  </span>
                                </div>
                              </SelectItem>
                              <SelectItem value="inactive">
                                <div className="flex flex-col">
                                  <span className="font-medium self-start">
                                    Inactive
                                  </span>
                                  <span className="text-xs text-muted-foreground">
                                    Account is disabled
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

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                            defaultValue={field.value}
                          >
                            <FormControl>
                              <SelectTrigger className="w-full rounded-xl border-border/50 bg-background/60 backdrop-blur-sm">
                                <SelectValue placeholder="Select language" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {languageOptions.map((lang) => (
                                <SelectItem key={lang.value} value={lang.value}>
                                  {lang.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormDescription className="text-xs">
                            Default interface language
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="space-y-4">
                    <FormField
                      control={form.control}
                      name="isVerified"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                          <FormControl>
                            <Checkbox
                              checked={field.value}
                              onCheckedChange={field.onChange}
                            />
                          </FormControl>
                          <div className="space-y-1 leading-none">
                            <FormLabel className="text-sm font-semibold">
                              Email Verified
                            </FormLabel>
                            <FormDescription className="text-xs">
                              Mark the user's email as verified (they won't need
                              to verify it)
                            </FormDescription>
                          </div>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="sendWelcomeEmail"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                          <FormControl>
                            <Checkbox
                              checked={field.value}
                              onCheckedChange={field.onChange}
                            />
                          </FormControl>
                          <div className="space-y-1 leading-none">
                            <FormLabel className="text-sm font-semibold">
                              Send Welcome Email
                            </FormLabel>
                            <FormDescription className="text-xs">
                              Send a welcome email with account setup
                              instructions
                            </FormDescription>
                          </div>
                        </FormItem>
                      )}
                    />
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Additional Information Section */}
            {(formStep === "details" || formStep === "review") && (
              <Card
                className="glass-card border-0 animate-slide-up"
                style={{ animationDelay: "0.2s" }}
              >
                <CardHeader>
                  <div>
                    <CardTitle className="text-xl font-bold">
                      Additional Information
                    </CardTitle>
                    <CardDescription>
                      Optional notes and account details
                    </CardDescription>
                  </div>
                </CardHeader>
                <CardContent>
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
                            placeholder="Add any notes about this user account..."
                            className="rounded-xl border-border/50 bg-background/60 backdrop-blur-sm min-h-[100px] resize-none"
                            {...field}
                          />
                        </FormControl>
                        <FormDescription className="text-xs">
                          Internal notes visible only to administrators
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>
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
                      Review user details before creating the account
                    </CardDescription>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <p className="text-sm font-semibold text-muted-foreground">
                        Full Name
                      </p>
                      <p className="text-base font-medium">
                        {watchedValues.name || "—"}
                      </p>
                    </div>
                    <div className="space-y-2">
                      <p className="text-sm font-semibold text-muted-foreground">
                        Email Address
                      </p>
                      <p className="text-base font-medium">
                        {watchedValues.email || "—"}
                      </p>
                    </div>
                    <div className="space-y-2">
                      <p className="text-sm font-semibold text-muted-foreground">
                        Phone Number
                      </p>
                      <p className="text-base font-medium">
                        {watchedValues.phone || "—"}
                      </p>
                    </div>
                    <div className="space-y-2">
                      <p className="text-sm font-semibold text-muted-foreground">
                        Organization
                      </p>
                      <p className="text-base font-medium">
                        {watchedValues.organization || "—"}
                      </p>
                    </div>
                    <div className="space-y-2">
                      <p className="text-sm font-semibold text-muted-foreground">
                        Role
                      </p>
                      <Badge variant="outline" className="capitalize">
                        {watchedValues.role?.replace("-", " ") || "—"}
                      </Badge>
                    </div>
                    <div className="space-y-2">
                      <p className="text-sm font-semibold text-muted-foreground">
                        Status
                      </p>
                      <Badge
                        variant="outline"
                        className={`capitalize ${
                          watchedValues.status === "active"
                            ? "bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300"
                            : watchedValues.status === "pending"
                              ? "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300"
                              : "bg-muted text-muted-foreground border-border"
                        }`}
                      >
                        {watchedValues.status || "—"}
                      </Badge>
                    </div>
                    <div className="space-y-2">
                      <p className="text-sm font-semibold text-muted-foreground">
                        Language
                      </p>
                      <p className="text-base font-medium">
                        {languageOptions.find(
                          (l) => l.value === watchedValues.languagePreference,
                        )?.label || "English"}
                      </p>
                    </div>
                    <div className="space-y-2">
                      <p className="text-sm font-semibold text-muted-foreground">
                        Email Verified
                      </p>
                      <Badge
                        variant={
                          watchedValues.isVerified ? "default" : "outline"
                        }
                      >
                        {watchedValues.isVerified ? "Yes" : "No"}
                      </Badge>
                    </div>
                  </div>
                  {watchedValues.accountNotes && (
                    <div className="space-y-2">
                      <p className="text-sm font-semibold text-muted-foreground">
                        Account Notes
                      </p>
                      <p className="text-sm text-foreground bg-muted/30 p-3 rounded-lg">
                        {watchedValues.accountNotes}
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Form Actions */}
            <div className="flex justify-between items-center gap-3 pt-4 border-t">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  if (formStep === "details") {
                    setFormStep("basic");
                  } else if (formStep === "review") {
                    setFormStep("details");
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
                        form.trigger(["name", "email"]);
                        const basicErrors = form.formState.errors;
                        if (!basicErrors.name && !basicErrors.email) {
                          setFormStep("details");
                        }
                      } else if (formStep === "details") {
                        form.trigger(["role", "status"]);
                        const detailsErrors = form.formState.errors;
                        if (!detailsErrors.role && !detailsErrors.status) {
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
                        <UserPlus className="mr-2 h-4 w-4" />
                        Create User
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
