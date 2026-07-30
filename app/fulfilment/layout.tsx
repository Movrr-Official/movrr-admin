import AuthWrapper from "@/components/auth/AuthWrapper";
import { ModuleSubNav } from "@/components/layout/ModuleSubNav";
import { FULFILMENT_NAV } from "@/lib/adminIaRoutes";

export default function FulfilmentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthWrapper capability="fulfilment.read">
      <div className="min-h-screen page-canvas">
        <ModuleSubNav items={FULFILMENT_NAV} ariaLabel="Fulfilment sections" />
        {children}
      </div>
    </AuthWrapper>
  );
}
