import AuthWrapper from "@/components/auth/AuthWrapper";
import { ADMIN_ONLY_ROLES } from "@/lib/authPermissions";
import PartnerDetailPageClient from "./PartnerDetailPageClient";

export default function PartnerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <AuthWrapper allowedRoles={ADMIN_ONLY_ROLES}>
      <PartnerDetailPageClient params={params} />
    </AuthWrapper>
  );
}
