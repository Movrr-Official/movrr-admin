import AuthWrapper from "@/components/auth/AuthWrapper";
import { ADMIN_ONLY_ROLES } from "@/lib/authPermissions";
import WaitlistManagement from "./WaitlistManagement";

export default async function WaitlistManagementPage() {
  return (
    <AuthWrapper allowedRoles={ADMIN_ONLY_ROLES}>
      <WaitlistManagement />
    </AuthWrapper>
  );
}
