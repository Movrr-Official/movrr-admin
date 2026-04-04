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

const getRedirectTarget = (value: string | string[] | undefined) =>
  typeof value === "string" && value.trim() ? value : "/";

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
    <Card className="border-0">
      <CardHeader className="text-center pb-6">
        <CardTitle className="text-3xl font-bold tracking-tight">
          Verify Your Admin Session
        </CardTitle>
        <CardDescription className="text-lg">
          Complete your authenticator challenge to continue into MOVRR Admin.
        </CardDescription>
      </CardHeader>
      <CardContent>
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
