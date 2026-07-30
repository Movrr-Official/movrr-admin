import AuthWrapper from "@/components/auth/AuthWrapper";
import WorkboardPage from "./WorkboardPage";

export default function RoutesPage() {
  return (
    <AuthWrapper capability="workboard.access">
      <WorkboardPage />
    </AuthWrapper>
  );
}
