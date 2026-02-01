import AuthWrapper from "@/components/auth/AuthWrapper";
import { ADMIN_ONLY_ROLES } from "@/lib/authPermissions";
import SettingsPage from "./SettingsPage";

export default function RoutesPage() {
  return (
    <AuthWrapper allowedRoles={ADMIN_ONLY_ROLES}>
      <SettingsPage />
    </AuthWrapper>
  );
}
