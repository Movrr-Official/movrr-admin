import AuthWrapper from "@/components/auth/AuthWrapper";
import { ADMIN_ONLY_ROLES } from "@/lib/authPermissions";
import FraudWorkbench from "./FraudWorkbench";

export default function FraudPage() {
  return (
    <AuthWrapper allowedRoles={ADMIN_ONLY_ROLES}>
      <FraudWorkbench />
    </AuthWrapper>
  );
}
