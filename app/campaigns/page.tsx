import AuthWrapper from "@/components/auth/AuthWrapper";
import { ADMIN_ONLY_ROLES } from "@/lib/authPermissions";
import CampaignsOverview from "./CampaignsOverview";

export default function CampaignsPage() {
  return (
    <AuthWrapper allowedRoles={ADMIN_ONLY_ROLES}>
      <CampaignsOverview />
    </AuthWrapper>
  );
}
