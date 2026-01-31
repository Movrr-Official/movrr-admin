import AuthWrapper from "@/components/auth/AuthWrapper";
import UsersOverview from "./UsersOverview";

export default function UsersPage() {
  return (
    <AuthWrapper>
      <UsersOverview />
    </AuthWrapper>
  );
}
