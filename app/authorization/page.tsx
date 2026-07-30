import AuthWrapper from "@/components/auth/AuthWrapper";
import { AuthorizationDiagnosticsPage } from "./AuthorizationDiagnosticsPage";

export default function AuthorizationPage() {
  return (
    <AuthWrapper capabilities={["authz.inspect", "authz.manage"]}>
      <AuthorizationDiagnosticsPage />
    </AuthWrapper>
  );
}
