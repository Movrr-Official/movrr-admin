"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { signUpWithEmail } from "@/lib/auth";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";

const riderSignupSchema = z.object({
  fullName: z.string().min(2, "Full name is required"),
  email: z.string().email("Enter a valid email address"),
  phone: z.string().optional(),
  city: z.string().optional(),
  country: z.string().optional(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  confirmPassword: z.string().min(8, "Confirm your password"),
}).refine((value) => value.password === value.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

type RiderSignupFormData = z.infer<typeof riderSignupSchema>;
type PublicOnboardingPolicy = {
  riderOnboardingMode: "open" | "waitlist_only" | "closed";
  requireCity: boolean;
  requireCountry: boolean;
  supportEmail: string;
  defaultLanguage: string;
  defaultTimezone: string;
  maintenanceMode: boolean;
  appUrl: string;
};

export default function SignUpPage() {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [isComplete, setIsComplete] = useState(false);
  const [policy, setPolicy] = useState<PublicOnboardingPolicy | null>(null);
  const [isPolicyLoading, setIsPolicyLoading] = useState(true);

  const form = useForm<RiderSignupFormData>({
    resolver: zodResolver(riderSignupSchema),
    defaultValues: {
      fullName: "",
      email: "",
      phone: "",
      city: "",
      country: "",
      password: "",
      confirmPassword: "",
    },
  });

  useEffect(() => {
    let active = true;
    const loadPolicy = async () => {
      try {
        const response = await fetch("/api/public/settings/onboarding", { cache: "no-store" });
        if (!response.ok) throw new Error("Failed to load rider onboarding policy");
        const nextPolicy = (await response.json()) as PublicOnboardingPolicy;
        if (!active) return;
        setPolicy(nextPolicy);
      } catch (nextError) {
        if (!active) return;
        setError(nextError instanceof Error ? nextError.message : "Failed to load rider onboarding policy");
      } finally {
        if (active) setIsPolicyLoading(false);
      }
    };
    void loadPolicy();
    return () => { active = false; };
  }, []);

  const disableInputs = isPending || isPolicyLoading || policy?.riderOnboardingMode !== "open";

  const onSubmit = (data: RiderSignupFormData) => {
    setError("");
    startTransition(async () => {
      if (!policy) {
        setError("Rider onboarding policy is unavailable. Please try again.");
        return;
      }
      if (policy.riderOnboardingMode !== "open") {
        setError(policy.riderOnboardingMode === "waitlist_only" ? "Rider signup is currently waitlist-only. Contact support or join the public waitlist." : "Rider signup is currently closed. Contact support for assistance.");
        return;
      }

      if (policy.requireCity && !(data.city ?? "").trim()) {
        form.setError("city", { message: "City is required" });
        return;
      }

      if (policy.requireCountry && !(data.country ?? "").trim()) {
        form.setError("country", { message: "Country is required" });
        return;
      }

      const { error: signUpError } = await signUpWithEmail({
        email: data.email,
        password: data.password,
        fullName: data.fullName,
        city: data.city?.trim() || undefined,
        country: data.country?.trim() || undefined,
        phone: data.phone,
      });

      if (signUpError) {
        setError(signUpError.message);
        return;
      }

      setIsComplete(true);
      form.reset();
    });
  };

  return (
    <Card className="border-0">
      <CardHeader className="text-center pb-6">
        <CardTitle className="text-3xl font-bold tracking-tight">Rider Sign Up</CardTitle>
        <CardDescription className="text-lg">Create your rider account to join Movrr campaigns.</CardDescription>
      </CardHeader>
      <CardContent>
        {isComplete ? (
          <Alert>
            <AlertDescription>Account created. Check your email to confirm your rider account.</AlertDescription>
          </Alert>
        ) : (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              {isPolicyLoading ? <Alert><AlertDescription>Loading rider onboarding policy...</AlertDescription></Alert> : null}
              {policy?.riderOnboardingMode === "waitlist_only" ? <Alert><AlertDescription>Rider self-signup is currently waitlist-only. Contact {policy.supportEmail || "Movrr support"} for the approved onboarding path.</AlertDescription></Alert> : null}
              {policy?.riderOnboardingMode === "closed" ? <Alert variant="destructive"><AlertDescription>Rider signup is currently closed. Contact {policy.supportEmail || "Movrr support"} for assistance.</AlertDescription></Alert> : null}
              {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
              <FormField control={form.control} name="fullName" render={({ field }) => <FormItem><FormLabel>Full name</FormLabel><FormControl><Input {...field} disabled={disableInputs} /></FormControl><FormMessage /></FormItem>} />
              <FormField control={form.control} name="email" render={({ field }) => <FormItem><FormLabel>Email</FormLabel><FormControl><Input type="email" {...field} disabled={disableInputs} /></FormControl><FormMessage /></FormItem>} />
              <FormField control={form.control} name="phone" render={({ field }) => <FormItem><FormLabel>Phone</FormLabel><FormControl><Input type="tel" {...field} disabled={disableInputs} /></FormControl><FormMessage /></FormItem>} />
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <FormField control={form.control} name="city" render={({ field }) => <FormItem><FormLabel>City{policy?.requireCity ? " *" : ""}</FormLabel><FormControl><Input {...field} disabled={disableInputs} /></FormControl><FormMessage /></FormItem>} />
                <FormField control={form.control} name="country" render={({ field }) => <FormItem><FormLabel>Country{policy?.requireCountry ? " *" : ""}</FormLabel><FormControl><Input {...field} disabled={disableInputs} /></FormControl><FormMessage /></FormItem>} />
              </div>
              <FormField control={form.control} name="password" render={({ field }) => <FormItem><FormLabel>Password</FormLabel><FormControl><Input type="password" {...field} disabled={disableInputs} /></FormControl><FormMessage /></FormItem>} />
              <FormField control={form.control} name="confirmPassword" render={({ field }) => <FormItem><FormLabel>Confirm password</FormLabel><FormControl><Input type="password" {...field} disabled={disableInputs} /></FormControl><FormMessage /></FormItem>} />
              <Button type="submit" className="w-full" disabled={disableInputs}>{isPending ? "Creating account..." : "Create Rider Account"}</Button>
            </form>
          </Form>
        )}
        <div className="mt-4 text-center text-sm text-muted-foreground">
          Already have an account? <Link href="/auth/signin" className="text-primary hover:underline">Sign in</Link>
        </div>
      </CardContent>
    </Card>
  );
}
