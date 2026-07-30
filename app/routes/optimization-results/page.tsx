import AuthWrapper from "@/components/auth/AuthWrapper";
import OptimizationResultsPage from "./OptimizationResultsPage";

export default function RoutesPage() {
  return (
    <AuthWrapper capabilities={["routes.read","routes.write"]}>
      <OptimizationResultsPage />
    </AuthWrapper>
  );
}
