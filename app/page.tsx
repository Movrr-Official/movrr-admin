import AuthWrapper from "@/components/auth/AuthWrapper";
import WaitlistOverview from "./waitlist/WaitlistOverview";

export default function AdminDashboard() {
  return (
    <AuthWrapper>
      <WaitlistOverview />
    </AuthWrapper>
  );
}
