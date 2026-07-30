import AuthWrapper from "@/components/auth/AuthWrapper";
import OpsHealthOverview from "./OpsHealthOverview";

export default function OpsHealthPage() {
  return (
    <AuthWrapper capability="platform.health.read">
      <OpsHealthOverview />
    </AuthWrapper>
  );
}
