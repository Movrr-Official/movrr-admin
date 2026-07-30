import AuthWrapper from "@/components/auth/AuthWrapper";
import CreateRewardCatalogPage from "./CreateRewardCatalogPage";

export default function RewardsCatalogCreatePage() {
  return (
    <AuthWrapper capabilities={["rewards.catalog.read","rewards.manage"]}>
      <CreateRewardCatalogPage />
    </AuthWrapper>
  );
}
