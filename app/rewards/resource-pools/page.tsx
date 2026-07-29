import AuthWrapper from "@/components/auth/AuthWrapper";
import { ADMIN_ONLY_ROLES } from "@/lib/authPermissions";
import ResourcePoolsPageClient from "./ResourcePoolsPageClient";

export default function ResourcePoolsPage() {
  return (
    <AuthWrapper allowedRoles={ADMIN_ONLY_ROLES}>
      <ResourcePoolsPageClient />
    </AuthWrapper>
  );
}
