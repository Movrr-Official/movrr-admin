import AuthWrapper from "@/components/auth/AuthWrapper";
import { ADMIN_ONLY_ROLES } from "@/lib/authPermissions";
import RidersOverview from "./RidersOverview";

export default function RidersPage() {
  return (
    <AuthWrapper allowedRoles={ADMIN_ONLY_ROLES}>
      <RidersOverview />
    </AuthWrapper>
  );
}
