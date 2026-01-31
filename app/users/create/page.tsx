import AuthWrapper from "@/components/auth/AuthWrapper";
import CreateUserPage from "./CreateUserPage";

export default function NewUserPage() {
  return (
    <AuthWrapper>
      <CreateUserPage />
    </AuthWrapper>
  );
}
