import AuthWrapper from "@/components/auth/AuthWrapper";
import { ADMIN_MODERATOR_ROLES } from "@/lib/authPermissions";
import SuggestedRoutesOverview from "./SuggestedRoutesOverview";

export default function SuggestedRoutesPage() {
  return (
    <AuthWrapper allowedRoles={ADMIN_MODERATOR_ROLES}>
      <SuggestedRoutesOverview />
    </AuthWrapper>
  );
}
