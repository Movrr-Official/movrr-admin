import AuthWrapper from "@/components/auth/AuthWrapper";
import { ADMIN_ONLY_ROLES } from "@/lib/authPermissions";
import FulfilmentOpsQueuePage from "./FulfilmentOpsQueuePage";

export default function FulfilmentOpsPage() {
  return (
    <AuthWrapper allowedRoles={ADMIN_ONLY_ROLES}>
      <FulfilmentOpsQueuePage />
    </AuthWrapper>
  );
}
