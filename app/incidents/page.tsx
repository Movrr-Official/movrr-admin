import AuthWrapper from "@/components/auth/AuthWrapper";
import { ADMIN_ONLY_ROLES } from "@/lib/authPermissions";
import IncidentsOverview from "./IncidentsOverview";

export default function IncidentsPage() {
  return (
    <AuthWrapper allowedRoles={ADMIN_ONLY_ROLES}>
      <IncidentsOverview />
    </AuthWrapper>
  );
}
