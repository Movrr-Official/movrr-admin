import AuthWrapper from "@/components/auth/AuthWrapper";
import RidersOverview from "./RidersOverview";

export default function RidersPage() {
  return (
    <AuthWrapper capabilities={["riders.read","riders.manage"]}>
      <RidersOverview />
    </AuthWrapper>
  );
}
