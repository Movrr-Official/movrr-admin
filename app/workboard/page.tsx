import AuthWrapper from "@/components/auth/AuthWrapper";
import { ADMIN_MODERATOR_ROLES } from "@/lib/authPermissions";
import WorkboardPage from "./WorkboardPage";

export default function RoutesPage() {
  return (
    <AuthWrapper allowedRoles={ADMIN_MODERATOR_ROLES}>
      <WorkboardPage />
    </AuthWrapper>
  );
}
