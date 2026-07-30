import AuthWrapper from "@/components/auth/AuthWrapper";
import RoutesOverview from "./RoutesOverview";

export default function RoutesPage() {
  return (
    <AuthWrapper capabilities={["routes.read","routes.write"]}>
      <RoutesOverview />
    </AuthWrapper>
  );
}
