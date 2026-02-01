import AuthWrapper from "@/components/auth/AuthWrapper";
import { ADMIN_ONLY_ROLES } from "@/lib/authPermissions";
import CreateRewardCatalogPage from "./CreateRewardCatalogPage";

export default function RewardsCatalogCreatePage() {
  return (
    <AuthWrapper allowedRoles={ADMIN_ONLY_ROLES}>
      <CreateRewardCatalogPage />
    </AuthWrapper>
  );
}
