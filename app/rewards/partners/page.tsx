import AuthWrapper from "@/components/auth/AuthWrapper";
import { ADMIN_ONLY_ROLES } from "@/lib/authPermissions";
import PartnersPageClient from "./PartnersPageClient";

export default function PartnersPage() {
  return (
    <AuthWrapper allowedRoles={ADMIN_ONLY_ROLES}>
      <PartnersPageClient />
    </AuthWrapper>
  );
}
