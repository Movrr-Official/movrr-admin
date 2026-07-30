import AuthWrapper from "@/components/auth/AuthWrapper";
import CreateRoutePage from "./CreateRoutePage";

export default function RoutesCreatePage() {
  return (
    <AuthWrapper capabilities={["routes.read","routes.write"]}>
      <CreateRoutePage />
    </AuthWrapper>
  );
}
