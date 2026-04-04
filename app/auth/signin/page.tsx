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
    <Card className="border-0">
      <CardHeader className="text-center pb-6">
        <CardTitle className="text-3xl font-bold tracking-tight">
          Welcome Back
        </CardTitle>
        <CardDescription className="text-lg">
          Sign in to access the internal admin dashboard.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <SignInForm enforceAdminMfa={securityPolicy.enforceAdminMfa} />
      </CardContent>
    </Card>
  );
}
