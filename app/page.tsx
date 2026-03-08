import AuthWrapper from "@/components/auth/AuthWrapper";
import { DASHBOARD_ACCESS_ROLES } from "@/lib/authPermissions";
import DashboardOverview from "./DashboardOverview";

export default function DashboardPage() {
  return (
    <AuthWrapper allowedRoles={DASHBOARD_ACCESS_ROLES}>
      <DashboardOverview />
    </AuthWrapper>
  );
}
