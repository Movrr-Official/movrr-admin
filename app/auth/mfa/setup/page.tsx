import { redirect } from "next/navigation";

import { AdminMfaSetupForm } from "@/components/forms/AdminMfaSetupForm";
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

const isAddFactorMode = (value: string | string[] | undefined) =>
  (typeof value === "string" ? value : Array.isArray(value) ? value[0] : "")
    .trim()
    .toLowerCase() === "add";

export default async function AdminMfaSetupPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const redirectTo = getRedirectTarget(params.redirectTo);
  const addFactorMode = isAddFactorMode(params.mode);
  const setupReturnPath = `/auth/mfa/setup?redirectTo=${encodeURIComponent(redirectTo)}&mode=add`;
  const context = await getAdminMfaContext();

  if (!context.user) {
    redirect(`/auth/signin?redirectTo=${encodeURIComponent(redirectTo)}`);
  }

  if (!context.adminUser) {
    redirect("/unauthorized");
  }

  if (context.currentLevel === "aal2" && !addFactorMode) {
    redirect(redirectTo);
  }

  if (context.verifiedFactors.length > 0 && !addFactorMode) {
    redirect(`/auth/mfa/challenge?redirectTo=${encodeURIComponent(redirectTo)}`);
  }

  if (
    addFactorMode &&
    context.verifiedFactors.length > 0 &&
    context.currentLevel !== "aal2"
  ) {
    redirect(
      `/auth/mfa/challenge?redirectTo=${encodeURIComponent(setupReturnPath)}`,
    );
  }

  return (
    <Card className="border-0">
      <CardHeader className="text-center pb-6">
        <CardTitle className="text-3xl font-bold tracking-tight">
          Set Up Admin MFA
        </CardTitle>
        <CardDescription className="text-lg">
          Enroll an authenticator app to finish securing your MOVRR Admin access.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <AdminMfaSetupForm
          email={context.adminUser.email}
          redirectTo={redirectTo}
        />
      </CardContent>
    </Card>
  );
}
