import AuthWrapper from "@/components/auth/AuthWrapper";
import { ADMIN_ONLY_ROLES } from "@/lib/authPermissions";
import CommunityRidesOverview from "./CommunityRidesOverview";

export default function CommunityRidesPage() {
  return (
    <AuthWrapper allowedRoles={ADMIN_ONLY_ROLES}>
      <CommunityRidesOverview />
    </AuthWrapper>
  );
}
