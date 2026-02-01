import AuthWrapper from "@/components/auth/AuthWrapper";
import { ADMIN_ONLY_ROLES } from "@/lib/authPermissions";
import UsersOverview from "./UsersOverview";

export default function UsersPage() {
  return (
    <AuthWrapper allowedRoles={ADMIN_ONLY_ROLES}>
      <UsersOverview />
    </AuthWrapper>
  );
}
