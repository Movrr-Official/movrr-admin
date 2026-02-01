import AuthWrapper from "@/components/auth/AuthWrapper";
import { ADMIN_ONLY_ROLES } from "@/lib/authPermissions";
import CreateCampaignPage from "./CreateCampaignPage";

export default function NewCampaignPage() {
  return (
    <AuthWrapper allowedRoles={ADMIN_ONLY_ROLES}>
      <CreateCampaignPage />
    </AuthWrapper>
  );
}
