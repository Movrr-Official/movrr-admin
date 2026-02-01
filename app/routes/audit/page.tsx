import AuthWrapper from "@/components/auth/AuthWrapper";
import { ADMIN_MODERATOR_ROLES } from "@/lib/authPermissions";
import AuditPage from "./AuditPage";

export default function RoutesAuditPage() {
  return (
    <AuthWrapper allowedRoles={ADMIN_MODERATOR_ROLES}>
      <AuditPage />
    </AuthWrapper>
  );
}
