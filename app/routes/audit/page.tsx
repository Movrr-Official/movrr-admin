import AuthWrapper from "@/components/auth/AuthWrapper";
import AuditPage from "./AuditPage";

export default function RoutesAuditPage() {
  return (
    <AuthWrapper capabilities={["routes.read","routes.write"]}>
      <AuditPage />
    </AuthWrapper>
  );
}
