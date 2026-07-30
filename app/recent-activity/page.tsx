import AuthWrapper from "@/components/auth/AuthWrapper";
import RecentActivityPage from "./RecentActivityPage";

export default function RecentActivityRoute() {
  return (
    <AuthWrapper capability="dashboard.read">
      <RecentActivityPage />
    </AuthWrapper>
  );
}
