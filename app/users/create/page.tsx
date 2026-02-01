import AuthWrapper from "@/components/auth/AuthWrapper";
import { ADMIN_ONLY_ROLES } from "@/lib/authPermissions";
import CreateUserPage from "./CreateUserPage";

export default function NewUserPage() {
  return (
    <AuthWrapper allowedRoles={ADMIN_ONLY_ROLES}>
      <CreateUserPage />
    </AuthWrapper>
  );
}
