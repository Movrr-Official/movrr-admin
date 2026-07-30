import AuthWrapper from "@/components/auth/AuthWrapper";
import SuggestedRoutesOverview from "./SuggestedRoutesOverview";

export default function SuggestedRoutesPage() {
  return (
    <AuthWrapper capability="routes.read">
      <SuggestedRoutesOverview />
    </AuthWrapper>
  );
}
