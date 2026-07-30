import AuthWrapper from "@/components/auth/AuthWrapper";
import DashboardOverview from "./DashboardOverview";

export default function DashboardPage() {
  return (
    <AuthWrapper capability="dashboard.read">
      <DashboardOverview />
    </AuthWrapper>
  );
}
