import AuthWrapper from "@/components/auth/AuthWrapper";
import WaitlistManagement from "./WaitlistManagement";

export default async function WaitlistManagementPage() {
  return (
    <AuthWrapper capability="waitlist.manage">
      <WaitlistManagement />
    </AuthWrapper>
  );
}
