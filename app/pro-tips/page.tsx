import AuthWrapper from "@/components/auth/AuthWrapper";
import { ADMIN_ONLY_ROLES } from "@/lib/authPermissions";
import ProTipsOverview from "./ProTipsOverview";

export default function ProTipsPage() {
  return (
    <AuthWrapper allowedRoles={ADMIN_ONLY_ROLES}>
      <ProTipsOverview />
    </AuthWrapper>
  );
}
