import { redirect } from "next/navigation";

import { AdminMfaChallengeForm } from "@/components/forms/AdminMfaChallengeForm";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getAdminMfaContext } from "@/lib/adminMfa";

const getRedirectTarget = (value: string | string[] | undefined): string => {
  if (typeof value !== "string") return "/";
  const trimmed = value.trim();
  return trimmed.startsWith("/") && !trimmed.startsWith("//") ? trimmed : "/";
};

export default async function AdminMfaChallengePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const redirectTo = getRedirectTarget(params.redirectTo);
  const context = await getAdminMfaContext();

  if (!context.user) {
    redirect(`/auth/signin?redirectTo=${encodeURIComponent(redirectTo)}`);
  }

  if (!context.adminUser) {
    redirect("/unauthorized");
  }

  if (context.currentLevel === "aal2") {
    redirect(redirectTo);
  }

  if (context.verifiedFactors.length === 0) {
    redirect(`/auth/mfa/setup?redirectTo=${encodeURIComponent(redirectTo)}`);
  }

  return (
    <Card className="border-0 bg-transparent shadow-none">
      <CardHeader className="space-y-2 px-6 pb-2 pt-6 sm:px-8 sm:pt-8">
        <CardTitle className="text-xl font-semibold tracking-tight text-movrr-text-heading sm:text-2xl">
          Two-Factor Authentication
        </CardTitle>
        <CardDescription className="text-sm text-movrr-text-secondary sm:text-[15px]">
          Enter the verification code from your authenticator app.
        </CardDescription>
      </CardHeader>
      <CardContent className="px-6 pb-6 pt-4 sm:px-8 sm:pb-8">
        <AdminMfaChallengeForm
          redirectTo={redirectTo}
          factors={context.verifiedFactors.map((factor) => ({
            factorType: factor.factor_type,
            friendlyName: factor.friendly_name,
            id: factor.id,
          }))}
        />
      </CardContent>
    </Card>
  );
}
