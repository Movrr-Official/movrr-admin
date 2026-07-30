import AuthWrapper from "@/components/auth/AuthWrapper";
import { ADMIN_ONLY_ROLES } from "@/lib/authPermissions";
import OpsHealthOverview from "./OpsHealthOverview";

export default function OpsHealthPage() {
  return (
    <AuthWrapper allowedRoles={ADMIN_ONLY_ROLES}>
      <OpsHealthOverview />
    </AuthWrapper>
  );
}
