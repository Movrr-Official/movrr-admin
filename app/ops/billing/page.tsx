import AuthWrapper from "@/components/auth/AuthWrapper";
import { ADMIN_ONLY_ROLES } from "@/lib/authPermissions";
import OpsBillingOverview from "./OpsBillingOverview";

export default function OpsBillingPage() {
  return (
    <AuthWrapper allowedRoles={ADMIN_ONLY_ROLES}>
      <OpsBillingOverview />
    </AuthWrapper>
  );
}
