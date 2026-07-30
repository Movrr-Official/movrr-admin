import { Suspense } from "react";
import AuthWrapper from "@/components/auth/AuthWrapper";
import RewardsOverview from "./RewardsOverview";

export default function RewardsPage() {
  return (
    <AuthWrapper capabilities={["rewards.catalog.read","rewards.manage"]}>
      <Suspense fallback={<div className="py-12 text-sm text-muted-foreground">Loading rewards…</div>}>
        <RewardsOverview />
      </Suspense>
    </AuthWrapper>
  );
}
