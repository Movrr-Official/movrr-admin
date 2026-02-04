import AuthWrapper from "@/components/auth/AuthWrapper";
import { ADMIN_ONLY_ROLES } from "@/lib/authPermissions";
import DashboardOverview from "./DashboardOverview";

export default function DashboardPage() {
  return (
    <AuthWrapper allowedRoles={ADMIN_ONLY_ROLES}>
      <DashboardOverview />
    </AuthWrapper>
  );
}
