import AuthWrapper from "@/components/auth/AuthWrapper";
import AdvertisersOverview from "./AdvertisersOverview";

export default function AdvertisersPage() {
  return (
    <AuthWrapper capability="advertisers.manage">
      <AdvertisersOverview />
    </AuthWrapper>
  );
}

