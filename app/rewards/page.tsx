import { Suspense } from "react";
import AuthWrapper from "@/components/auth/AuthWrapper";
import { ADMIN_ONLY_ROLES } from "@/lib/authPermissions";
import RewardsOverview from "./RewardsOverview";

export default function RewardsPage() {
  return (
    <AuthWrapper allowedRoles={ADMIN_ONLY_ROLES}>
      <Suspense fallback={<div className="py-12 text-sm text-muted-foreground">Loading rewards…</div>}>
        <RewardsOverview />
      </Suspense>
    </AuthWrapper>
  );
}
