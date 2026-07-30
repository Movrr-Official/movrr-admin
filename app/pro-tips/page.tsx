import AuthWrapper from "@/components/auth/AuthWrapper";
import ProTipsOverview from "./ProTipsOverview";

export default function ProTipsPage() {
  return (
    <AuthWrapper capability="protips.manage">
      <ProTipsOverview />
    </AuthWrapper>
  );
}
