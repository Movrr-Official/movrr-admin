import AuthWrapper from "@/components/auth/AuthWrapper";
import CreateAdvertiserPage from "./CreateAdvertiserPage";

export default function NewAdvertiserPage() {
  return (
    <AuthWrapper capability="advertisers.manage">
      <CreateAdvertiserPage />
    </AuthWrapper>
  );
}

