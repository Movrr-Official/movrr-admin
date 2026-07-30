import AuthWrapper from "@/components/auth/AuthWrapper";
import NotificationsOverview from "./NotificationsOverview";

export default function NotificationsPage() {
  return (
    <AuthWrapper capability="notifications.read">
      <NotificationsOverview />
    </AuthWrapper>
  );
}
