import AuthWrapper from "@/components/auth/AuthWrapper";
import { ADMIN_ONLY_ROLES } from "@/lib/authPermissions";
import NotificationsOverview from "./NotificationsOverview";

export default function NotificationsPage() {
  return (
    <AuthWrapper allowedRoles={ADMIN_ONLY_ROLES}>
      <NotificationsOverview />
    </AuthWrapper>
  );
}
