import { Suspense } from "react";
import AuthWrapper from "@/components/auth/AuthWrapper";
import SettingsPage from "./SettingsPage";

export default function RoutesPage() {
  return (
    <AuthWrapper capabilities={["settings.manage","settings.security","authz.inspect"]}>
      <Suspense>
        <SettingsPage />
      </Suspense>
    </AuthWrapper>
  );
}
