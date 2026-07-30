import AuthWrapper from "@/components/auth/AuthWrapper";
import CampaignsOverview from "./CampaignsOverview";

export default function CampaignsPage() {
  return (
    <AuthWrapper capabilities={["campaigns.read","campaigns.write"]}>
      <CampaignsOverview />
    </AuthWrapper>
  );
}
