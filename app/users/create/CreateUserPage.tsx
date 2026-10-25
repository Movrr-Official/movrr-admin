"use client";

import { useState, useMemo, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQueryClient } from "@tanstack/react-query";
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
import { DASHBOARD_COUNTS_QUERY_KEY } from "@/providers/CountProvider";

import { getAccountOrganisations } from "@/app/actions/accountMemberships";
import { ACCOUNT_CREATION_OPTIONS, rolesForDomain, accountRoleLabel, ORGANISATION_TYPES, type AccountDomain } from "@/features/identity/domain/accountDomains";
import { accountCreationSchema } from "@/features/identity/domain/accountCreation";
import type { AccountOrganisation } from "@/features/identity/domain/membershipManagement";
import { CANONICAL_EMPLOYEE_ROLES } from "@/features/organisations/domain/employeeRoleTemplates";

const createUserFormSchema = accountCreationSchema;

type CreateUserFormData = z.infer<typeof createUserFormSchema>;

const roleDescriptions: Record<string, string> = {
  super_admin: "Unrestricted platform authority including security break-glass",
  security_admin: "Privileged role approval and security settings",
  operations_manager: "Broad operational ownership without security admin powers",
  platform_operator: "Jobs, health, and platform reliability",
  campaign_manager: "Campaign lifecycle without user admin powers",
  partner_operations_manager: "Fulfilment, rewards catalog, and partner approvals",
  fraud_analyst: "Fraud review and ride verification",
  trust_safety_analyst: "Incident handling and safety investigations",
  support_agent: "Customer support read access and incident intake",
  support_lead: "Support leadership including waitlist escalations",
  finance_operator: "Billing operations and audited exports",
  compliance_analyst: "Compliance and programme oversight (read-heavy)",
  programme_operations_manager: "Government programme visibility",
  executive_viewer: "Executive read-only analytics and reports",
  product_operations: "Routes, workboard, and product workflows",
  engineering_operations: "Platform reliability and feature flags",
  rider: "Rider with route and campaign participation",
  advertiser: "Advertiser product account",
};

const EMPLOYEE_CREATE_ROLE_VALUES = CANONICAL_EMPLOYEE_ROLES;

const languageOptions = [
  { value: "en", label: "English" },
  { value: "nl", label: "Dutch" },
  { value: "de", label: "German" },
  { value: "fr", label: "French" },
  { value: "es", label: "Spanish" },
];

const statusDescriptions = {
  active: "User can access the platform",
  pending: "Awaiting activation",
  inactive: "Account is disabled",
};

const roleLabel = (role: string) =>
  role.split("_").map(part => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");

export default function CreateUserPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [formStep, setFormStep] = useState<"basic" | "details" | "review">(
    "basic",
  );
  const initialRole = useMemo(() => {
    const requestedRole = searchParams.get("role");
    // Preserve an explicitly requested role for validation. An invalid role must
    // not silently turn an employee creation link into a Rider request.
    if (requestedRole) return requestedRole as CreateUserFormData["role"];
    return undefined;
  }, [searchParams]);

  const form = useForm<z.input<typeof createUserFormSchema>, unknown, CreateUserFormData>({
    resolver: zodResolver(createUserFormSchema),
    defaultValues: {
      email: "",
      name: "",
      phone: "",
      role: initialRole,
      domain: CANONICAL_EMPLOYEE_ROLES.some(role => role === initialRole) ? "staff" : initialRole === "rider" ? "rider" : "user",
      membershipStatus: "active",
      status: "active",
      organization: "",
      languagePreference: "en",
      isVerified: false,
      accountNotes: "",
      sendWelcomeEmail: true,
      city: "",
      country: "",
    },
    mode: "onChange",
  });

  const watchedValues = form.watch();
  const [organisations, setOrganisations] = useState<AccountOrganisation[]>([]);
  const [organisationError, setOrganisationError] = useState("");
  useEffect(() => {
    if (!["partner", "advertiser", "government"].includes(watchedValues.domain)) return;
    let cancelled = false;
    getAccountOrganisations().then(result => { if (cancelled) return; if (result.success) setOrganisations(result.data); else setOrganisationError(result.error.message); }).catch(() => { if (!cancelled) setOrganisationError("Unable to load organisations. Reload and try again."); });
    return () => { cancelled = true; };
  }, [watchedValues.domain]);

  const onSubmit = async (data: CreateUserFormData) => {
    setIsLoading(true);
    try {
      const result = await createUser(data);

      if (!result.success) {
        throw new Error(result.error || "Failed to create user");
      }

      toast({
        title: "User Created Successfully",
        description: result.warning ?? (data.sendWelcomeEmail
          ? `User "${data.name}" has been created and received an account setup email.`
          : `User "${data.name}" has been created successfully.`),
      });

      await queryClient.invalidateQueries({
        queryKey: DASHBOARD_COUNTS_QUERY_KEY,
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

  const selectedRoleDescription = watchedValues.domain === "partner" && watchedValues.role === "partner_operations_manager"
    ? "Manage this partner's rewards, locations, fulfilment and operational staff."
    : roleDescriptions[watchedValues.role ?? ""] || "";
  const isRiderRole = watchedValues.role === "rider";

  return (
    <div className="min-h-screen page-canvas">
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
        <Card className="border-border">
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
                      className={`flex items-center justify-center w-10 h-10 rounded-full border-2 transition-all ${ isActive ? "border-primary bg-primary text-primary-foreground" : isCompleted ? "border-primary bg-primary/10 text-primary" : "border-muted bg-muted text-muted-foreground" }`}
                    >
                      <StepIcon className="h-5 w-5" />
                    </div>
                    <span
                      className={`mt-2 text-xs font-medium ${ isActive ? "text-primary" : "text-muted-foreground" }`}
                    >
                      {step.label}
                    </span>
                  </div>
                  {index < 2 && (
                    <div
                      className={`flex-1 h-0.5 mx-4 transition-all ${ isCompleted ? "bg-primary" : "bg-muted" }`}
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
              <Card className="border-border animate-slide-up">
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
                  <FormField control={form.control} name="domain" render={({ field }) => (
                    <FormItem><FormLabel>Account Type</FormLabel>
                      <Select value={field.value} onValueChange={value => {
                        field.onChange(value); form.setValue("organisationId", undefined);
                        form.setValue("role", value === "user" ? undefined : value === "rider" ? "rider" : value === "staff" ? "support_agent" : "viewer");
                        form.setValue("city", ""); form.setValue("country", "");
                      }}><FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                        <SelectContent>{ACCOUNT_CREATION_OPTIONS.map(domain => <SelectItem key={domain} value={domain}>{domain === "user" ? "Unassigned" : domain === "staff" ? "Internal Staff" : roleLabel(domain)}</SelectItem>)}</SelectContent>
                      </Select><FormMessage />
                    </FormItem>)} />
                  {["partner", "advertiser", "government"].includes(watchedValues.domain) && <FormField control={form.control} name="organisationId" render={({ field }) => (
                    <FormItem><FormLabel>Organisation</FormLabel>
                      <Select value={String(field.value ?? "")} onValueChange={field.onChange}><FormControl><SelectTrigger><SelectValue placeholder="Select organisation" /></SelectTrigger></FormControl>
                        <SelectContent>{organisations.filter(org => org.type === ORGANISATION_TYPES[watchedValues.domain as keyof typeof ORGANISATION_TYPES]).map(org => <SelectItem key={org.id} value={org.id}>{org.name}</SelectItem>)}</SelectContent>
                      </Select><FormMessage />{organisationError && <p role="alert" className="text-destructive text-sm">{organisationError}</p>}
                    </FormItem>)} />}
                  {["partner", "advertiser", "government"].includes(watchedValues.domain) && <FormField control={form.control} name="membershipStatus" render={({ field }) => (
                    <FormItem><FormLabel>Membership status</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}><FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                        <SelectContent><SelectItem value="active">Active membership</SelectItem><SelectItem value="invited">Awaiting invitation acceptance</SelectItem></SelectContent>
                      </Select><FormDescription>Account status and organisation access are independent. Create an invitation link from User Details for a membership awaiting acceptance.</FormDescription><FormMessage />
                    </FormItem>)} />}
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
                          <FormLabel className="text-sm font-semibold flex items-center gap-2">
                            Email Address{" "}
                            <span className="text-destructive">*</span>
                          </FormLabel>
                          <FormControl>
                            <Input
                              type="email"
                              placeholder="user@example.com"
                              className="rounded-xl border-border/50 bg-background/60"
                              {...field} value={String(field.value ?? "")}
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
                              className="rounded-xl border-border/50 bg-background/60"
                              {...field} value={String(field.value ?? "")}
                            />
                          </FormControl>
                          <FormDescription className="text-xs">
                            Optional contact number
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  {isRiderRole && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="city"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-sm font-semibold flex items-center gap-2">
                              City <span className="text-destructive">*</span>
                            </FormLabel>
                            <FormControl>
                              <Input
                                placeholder="Amsterdam"
                                className="rounded-xl border-border/50 bg-background/60"
                                {...field} value={String(field.value ?? "")}
                              />
                            </FormControl>
                            <FormDescription className="text-xs">
                              Required for rider profile creation.
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="country"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-sm font-semibold flex items-center gap-2">
                              Country <span className="text-destructive">*</span>
                            </FormLabel>
                            <FormControl>
                              <Input
                                placeholder="Netherlands"
                                className="rounded-xl border-border/50 bg-background/60"
                                {...field} value={String(field.value ?? "")}
                              />
                            </FormControl>
                            <FormDescription className="text-xs">
                              Required for rider profile creation.
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Account settings Section */}
            {(formStep === "details" || formStep === "review") && (
              <Card
                className="border-border animate-slide-up"
                style={{ animationDelay: "0.1s" }}
              >
                <CardHeader>
                  <div>
                    <CardTitle className="text-xl font-bold">
                      Role & Access
                    </CardTitle>
                    <CardDescription>
                      Status and any selected access
                    </CardDescription>
                  </div>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 items-start gap-4">
                    {!["user", "rider"].includes(watchedValues.domain) && <>
                    <FormField
                      control={form.control}
                      name="role"
                      render={({ field }) => (
                        <FormItem className="content-start">
                          <FormLabel className="text-sm font-semibold flex items-center gap-2">
                            {watchedValues.domain === "staff" ? "Internal Staff Role" : "Organisation Role"}{" "}
                            <span className="text-destructive">*</span>
                          </FormLabel>
                          <Select
                            onValueChange={field.onChange}
                            value={field.value}
                          >
                            <FormControl>
                              <SelectTrigger className="w-full rounded-xl border-border/50 bg-background/60">
                                <SelectValue placeholder="Select role">{field.value ? accountRoleLabel(watchedValues.domain, field.value) : ""}</SelectValue>
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {rolesForDomain(watchedValues.domain).map(role => <SelectItem key={role} value={role}>{accountRoleLabel(watchedValues.domain, role)}</SelectItem>)}
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
                    </>}
                    <FormField
                      control={form.control}
                      name="status"
                      render={({ field }) => (
                        <FormItem className="content-start">
                          <FormLabel className="text-sm font-semibold flex items-center gap-2">
                            Account Status{" "}
                            <span className="text-destructive">*</span>
                          </FormLabel>
                          <Select
                            onValueChange={field.onChange}
                            value={field.value}
                          >
                            <FormControl>
                              <SelectTrigger className="w-full rounded-xl border-border/50 bg-background/60">
                                <SelectValue placeholder="Select status">{(field.value ?? "active").charAt(0).toUpperCase() + (field.value ?? "active").slice(1)}</SelectValue>
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
                          <FormDescription className="text-xs">
                            {statusDescriptions[field.value ?? "active"]}
                          </FormDescription>
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
                              <SelectTrigger className="w-full rounded-xl border-border/50 bg-background/60">
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
                              Send an account setup email with a secure password
                              creation link
                            </FormDescription>
                          </div>
                        </FormItem>
                      )}
                    />
                  </div>
                  <Alert>
                    <Info className="h-4 w-4" />
                    <AlertDescription>
                      External accounts require an existing organisation. Create a new advertiser business from the Advertisers module.
                    </AlertDescription>
                  </Alert>
                </CardContent>
              </Card>
            )}

            {/* Additional Information Section */}
            {(formStep === "details" || formStep === "review") && (
              <Card
                className="border-border animate-slide-up"
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
                            className="rounded-xl border-border/50 bg-background/60 min-h-[100px] resize-none"
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
                className="border-border animate-slide-up"
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
                    {watchedValues.organisationId && <div className="space-y-2">
                      <p className="text-sm font-semibold text-muted-foreground">Organisation</p>
                      <p className="text-base font-medium">{organisations.find(organisation => organisation.id === watchedValues.organisationId)?.name}</p>
                    </div>}
                    <div className="space-y-2">
                      <p className="text-sm font-semibold text-muted-foreground">
                        Account Type
                      </p>
                      <Badge variant="outline" className="capitalize">
                        {watchedValues.domain === "user" ? "Unassigned" : watchedValues.domain === "rider" ? "Rider" : `${watchedValues.domain === "staff" ? "Internal Staff" : roleLabel(watchedValues.domain)} · ${watchedValues.role ? accountRoleLabel(watchedValues.domain, watchedValues.role) : ""}`}
                      </Badge>
                    </div>
                    <div className="space-y-2">
                      <p className="text-sm font-semibold text-muted-foreground">
                        Status
                      </p>
                      <Badge
                        variant="outline"
                        className={`capitalize ${ watchedValues.status === "active" ? "bg-success/10 text-success border-success/30" : watchedValues.status === "pending" ? "bg-warning/10 text-warning border-warning/30" : "bg-muted text-muted-foreground border-border" }`}
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
                    onClick={async () => {
                      if (formStep === "basic") {
                        const fields: (keyof CreateUserFormData)[] = [
                          "name",
                          "email",
                        ];
                        if (isRiderRole) {
                          fields.push("city", "country");
                        }
                        if (await form.trigger([...fields, "domain", "organisationId"])) setFormStep("details");
                      } else if (formStep === "details") {
                        if (await form.trigger()) setFormStep("review");
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
