import AuthWrapper from "@/components/auth/AuthWrapper";
import ProgrammesOverview from "./ProgrammesOverview";

export default function ProgrammesPage() {
  return (
    <AuthWrapper capability="programmes.read">
      <ProgrammesOverview />
    </AuthWrapper>
  );
}
