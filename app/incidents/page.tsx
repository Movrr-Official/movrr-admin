import AuthWrapper from "@/components/auth/AuthWrapper";
import IncidentsOverview from "./IncidentsOverview";

export default function IncidentsPage() {
  return (
    <AuthWrapper capabilities={["incidents.read","incidents.manage","incidents.create"]}>
      <IncidentsOverview />
    </AuthWrapper>
  );
}
