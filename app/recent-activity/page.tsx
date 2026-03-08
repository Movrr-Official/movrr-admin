import AuthWrapper from "@/components/auth/AuthWrapper";
import { DASHBOARD_ACCESS_ROLES } from "@/lib/authPermissions";
import RecentActivityPage from "./RecentActivityPage";

export default function RecentActivityRoute() {
  return (
    <AuthWrapper allowedRoles={DASHBOARD_ACCESS_ROLES}>
      <RecentActivityPage />
    </AuthWrapper>
  );
}
