import AuthWrapper from "@/components/auth/AuthWrapper";
import { PageHeader } from "@/components/PageHeader";
import { AccountDeletionMonitor } from "@/components/ops/AccountDeletionMonitor";

export default function AccountDeletionPage() {
  return (
    <AuthWrapper pathname="/ops/account-deletion">
      <div className="min-h-screen page-canvas">
        <div className="space-y-6">
          <PageHeader
            title="Account deletion"
            description="Manage request intake and review privacy requests and outstanding obligations."
          />
          <AccountDeletionMonitor />
        </div>
      </div>
    </AuthWrapper>
  );
}
