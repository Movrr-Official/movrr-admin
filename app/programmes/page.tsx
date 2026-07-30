import AuthWrapper from "@/components/auth/AuthWrapper";
import { ADMIN_ONLY_ROLES } from "@/lib/authPermissions";
import ProgrammesOverview from "./ProgrammesOverview";

const PROGRAMMES_READ_ROLES = [
  ...ADMIN_ONLY_ROLES,
  "compliance_officer",
  "government",
] as const;

export default function ProgrammesPage() {
  return (
    <AuthWrapper allowedRoles={[...PROGRAMMES_READ_ROLES]}>
      <ProgrammesOverview />
    </AuthWrapper>
  );
}
