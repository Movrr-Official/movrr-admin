import AuthWrapper from "@/components/auth/AuthWrapper";
import { ADMIN_MODERATOR_ROLES } from "@/lib/authPermissions";
import CreateRoutePage from "./CreateRoutePage";

export default function RoutesCreatePage() {
  return (
    <AuthWrapper allowedRoles={ADMIN_MODERATOR_ROLES}>
      <CreateRoutePage />
    </AuthWrapper>
  );
}
