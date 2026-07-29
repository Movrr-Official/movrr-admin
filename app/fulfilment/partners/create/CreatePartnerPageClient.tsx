"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  ArrowLeft,
  Building2,
  CheckCircle2,
  Handshake,
  Info,
  Loader2,
  Settings,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { PageHeader } from "@/components/PageHeader";
import { useToast } from "@/hooks/useToast";
import { useCreateOrganisation } from "@/hooks/useOrganisationsData";
import { FULFILMENT_ROUTES } from "@/lib/adminIaRoutes";

const createPartnerFormSchema = z.object({
  name: z
    .string()
    .min(1, "Organisation name is required")
    .max(120, "Name must be less than 120 characters"),
});

type CreatePartnerFormData = z.infer<typeof createPartnerFormSchema>;

const STEPS = [
  { key: "basic", label: "Basic Info", icon: Building2 },
  { key: "details", label: "Details", icon: Settings },
  { key: "review", label: "Review", icon: CheckCircle2 },
] as const;

type FormStep = (typeof STEPS)[number]["key"];

export default function CreatePartnerPageClient() {
  const router = useRouter();
  const { toast } = useToast();
  const createOrganisation = useCreateOrganisation();
  const [formStep, setFormStep] = useState<FormStep>("basic");

  const form = useForm<CreatePartnerFormData>({
    resolver: zodResolver(createPartnerFormSchema),
    defaultValues: {
      name: "",
    },
    mode: "onChange",
  });

  const watchedValues = form.watch();
  const isLoading = createOrganisation.isPending;

  const onSubmit = async (data: CreatePartnerFormData) => {
    try {
      const organisation = await createOrganisation.mutateAsync({
        name: data.name.trim(),
        type: "reward_partner",
      });
      toast({
        title: "Partner Created Successfully",
        description: `Reward partner "${data.name.trim()}" has been created. You can invite staff next.`,
      });
      router.push(FULFILMENT_ROUTES.partnerDetail(organisation.id));
    } catch (error) {
      toast({
        title: "Creation Failed",
        description:
          error instanceof Error
            ? error.message
            : "Failed to create partner. Please try again.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title="Create New Partner"
        description="Add a reward partner organisation for fulfilment operations, collections, and staff access"
        action={{
          label: "Back to Partners",
          href: FULFILMENT_ROUTES.partners,
          icon: <ArrowLeft className="h-4 w-4" />,
          asChild: true,
          variant: "outline",
        }}
      />

      <Card className="border-border">
        <CardContent className="flex items-center justify-between pt-6">
          {STEPS.map((step, index) => {
            const StepIcon = step.icon;
            const isActive = formStep === step.key;
            const isCompleted =
              (formStep === "details" && step.key === "basic") ||
              (formStep === "review" &&
                (step.key === "basic" || step.key === "details"));

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
                {index < STEPS.length - 1 && (
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

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
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
                    Essential organisation identity for the reward partner
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
                          Organisation Name{" "}
                          <span className="text-destructive">*</span>
                        </FormLabel>
                        <FormControl>
                          <Input
                            placeholder="Enter partner organisation name"
                            className="rounded-xl border-border/50 bg-background/60"
                            disabled={formStep === "review"}
                            {...field}
                          />
                        </FormControl>
                        <FormDescription className="text-xs">
                          Display name used across fulfilment ops and partner
                          workspace
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </CardContent>
            </Card>
          )}

          {(formStep === "details" || formStep === "review") && (
            <Card
              className="border-border animate-slide-up"
              style={{ animationDelay: "0.1s" }}
            >
              <CardHeader>
                <div>
                  <CardTitle className="text-xl font-bold">
                    Organisation Type
                  </CardTitle>
                  <CardDescription>
                    Partner organisations participate in reward fulfilment
                  </CardDescription>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <p className="text-sm font-semibold">Organisation Type</p>
                    <div className="flex items-center gap-2 rounded-xl border border-border/50 bg-background/60 px-3 py-2.5">
                      <Handshake className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium">
                        Reward Partner
                      </span>
                      <Badge variant="secondary" className="ml-auto">
                        Fixed
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Created as a reward partner for collections, validation,
                      and staff access
                    </p>
                  </div>
                </div>

                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertDescription>
                    After creation, invite staff from the partner detail page
                    using an existing user ID. Create the user first under Users
                    if they do not already have an account.
                  </AlertDescription>
                </Alert>
              </CardContent>
            </Card>
          )}

          {formStep === "review" && (
            <Card
              className="border-border animate-slide-up"
              style={{ animationDelay: "0.2s" }}
            >
              <CardHeader>
                <div>
                  <CardTitle className="text-xl font-bold">
                    Review & Confirm
                  </CardTitle>
                  <CardDescription>
                    Review partner details before creating the organisation
                  </CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <p className="text-sm font-semibold text-muted-foreground">
                      Organisation Name
                    </p>
                    <p className="text-base font-medium">
                      {watchedValues.name || "—"}
                    </p>
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm font-semibold text-muted-foreground">
                      Organisation Type
                    </p>
                    <Badge variant="outline">Reward Partner</Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

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
                  router.push(FULFILMENT_ROUTES.partners);
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
                      const valid = await form.trigger(["name"]);
                      if (valid) setFormStep("details");
                      return;
                    }
                    setFormStep("review");
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
                      <Handshake className="mr-2 h-4 w-4" />
                      Create Partner
                    </>
                  )}
                </Button>
              )}
            </div>
          </div>
        </form>
      </Form>
    </div>
  );
}
