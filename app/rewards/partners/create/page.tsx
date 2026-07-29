import AuthWrapper from "@/components/auth/AuthWrapper";
import { ADMIN_ONLY_ROLES } from "@/lib/authPermissions";
import CreatePartnerPageClient from "./CreatePartnerPageClient";

export default function CreatePartnerPage() {
  return (
    <AuthWrapper allowedRoles={ADMIN_ONLY_ROLES}>
      <CreatePartnerPageClient />
    </AuthWrapper>
  );
}
