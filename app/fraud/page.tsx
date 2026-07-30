import AuthWrapper from "@/components/auth/AuthWrapper";
import FraudWorkbench from "./FraudWorkbench";

export default function FraudPage() {
  return (
    <AuthWrapper capability="fraud.review">
      <FraudWorkbench />
    </AuthWrapper>
  );
}
