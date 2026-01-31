import AuthWrapper from "@/components/auth/AuthWrapper";
import CreateCampaignPage from "./CreateCampaignPage";

export default function NewCampaignPage() {
  return (
    <AuthWrapper>
      <CreateCampaignPage />
    </AuthWrapper>
  );
}
