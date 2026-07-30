import AuthWrapper from "@/components/auth/AuthWrapper";
import OpsBillingOverview from "./OpsBillingOverview";

export default function OpsBillingPage() {
  return (
    <AuthWrapper capabilities={["billing.read","billing.manage"]}>
      <OpsBillingOverview />
    </AuthWrapper>
  );
}
