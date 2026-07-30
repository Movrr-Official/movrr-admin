import AuthWrapper from "@/components/auth/AuthWrapper";
import WorkboardInvitePage from "./WorkboardInvitePage";

export default function WorkboardInviteRoute() {
  return (
    <AuthWrapper capability="workboard.access">
      <WorkboardInvitePage />
    </AuthWrapper>
  );
}
