import AuthWrapper from "@/components/auth/AuthWrapper";
import CommunityRidesOverview from "./CommunityRidesOverview";

export default function CommunityRidesPage() {
  return (
    <AuthWrapper capability="community.manage">
      <CommunityRidesOverview />
    </AuthWrapper>
  );
}
