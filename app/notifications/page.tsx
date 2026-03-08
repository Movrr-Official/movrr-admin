import AuthWrapper from "@/components/auth/AuthWrapper";
import { NOTIFICATION_ACCESS_ROLES } from "@/lib/authPermissions";
import NotificationsOverview from "./NotificationsOverview";

export default function NotificationsPage() {
  return (
    <AuthWrapper allowedRoles={NOTIFICATION_ACCESS_ROLES}>
      <NotificationsOverview />
    </AuthWrapper>
  );
}
