import { redirect } from "next/navigation";

import AuthWrapper from "@/components/auth/AuthWrapper";
import { AdminMfaManagementPanel } from "@/components/account/AdminMfaManagementPanel";
import { DASHBOARD_ACCESS_ROLES } from "@/lib/authPermissions";
import { getAdminMfaManagementData } from "@/lib/adminMfa";

async function AccountSecurityContent() {
  const data = await getAdminMfaManagementData();

  if (!data) {
    redirect("/auth/signin?redirectTo=%2Faccount%2Fsecurity");
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 md:px-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Account Security</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Manage the MFA factors protecting your MOVRR Admin access and use
          emergency recovery only for verified operator incidents.
        </p>
      </div>

      <AdminMfaManagementPanel
        adminEmail={data.adminUser.email}
        adminRole={data.adminUser.role}
        currentLevel={data.currentLevel}
        factors={data.factors}
        recoveryTargets={data.availableRecoveryTargets}
      />
    </div>
  );
}

export default function AccountSecurityPage() {
  return (
    <AuthWrapper allowedRoles={DASHBOARD_ACCESS_ROLES}>
      <AccountSecurityContent />
    </AuthWrapper>
  );
}
