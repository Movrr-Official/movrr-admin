import AuthWrapper from "@/components/auth/AuthWrapper";
import OpsJobsOverview from "./OpsJobsOverview";

export default function OpsJobsPage() {
  return (
    <AuthWrapper capability="platform.jobs.manage">
      <OpsJobsOverview />
    </AuthWrapper>
  );
}
