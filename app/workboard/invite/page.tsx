import AuthWrapper from "@/components/auth/AuthWrapper";
import { ADMIN_MODERATOR_ROLES } from "@/lib/authPermissions";
import WorkboardInvitePage from "./WorkboardInvitePage";

export default function WorkboardInviteRoute() {
  return (
    <AuthWrapper allowedRoles={ADMIN_MODERATOR_ROLES}>
      <WorkboardInvitePage />
    </AuthWrapper>
  );
}
