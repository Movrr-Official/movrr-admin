import AuthWrapper from "@/components/auth/AuthWrapper";
import { ADMIN_ONLY_ROLES } from "@/lib/authPermissions";
import OpsJobsOverview from "./OpsJobsOverview";

export default function OpsJobsPage() {
  return (
    <AuthWrapper allowedRoles={ADMIN_ONLY_ROLES}>
      <OpsJobsOverview />
    </AuthWrapper>
  );
}
