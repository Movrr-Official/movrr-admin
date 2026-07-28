import React from "react";

import { SignInForm } from "@/components/forms/signin-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getPlatformSecurityPolicy } from "@/lib/platformSettings";

export default async function SignInPage() {
  const securityPolicy = await getPlatformSecurityPolicy();

  return (
    <Card className="border-0 bg-transparent shadow-none">
      <CardHeader className="pb-6 text-center">
        <CardTitle className="text-2xl font-semibold tracking-tight text-movrr-text-heading md:text-3xl">
          Welcome Back
        </CardTitle>
        <CardDescription className="text-base text-movrr-text-secondary">
          Sign in to access the internal admin dashboard.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <SignInForm enforceAdminMfa={securityPolicy.enforceAdminMfa} />
      </CardContent>
    </Card>
  );
}
