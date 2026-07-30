import AuthWrapper from "@/components/auth/AuthWrapper";
import RideSessionsOverview from "./RideSessionsOverview";

export default function RideSessionsPage() {
  return (
    <AuthWrapper capabilities={["rides.read","rides.verify"]}>
      <RideSessionsOverview />
    </AuthWrapper>
  );
}
