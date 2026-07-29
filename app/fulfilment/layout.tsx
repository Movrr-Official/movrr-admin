import AuthWrapper from "@/components/auth/AuthWrapper";
import { ModuleSubNav } from "@/components/layout/ModuleSubNav";
import { ADMIN_ONLY_ROLES } from "@/lib/authPermissions";
import { FULFILMENT_NAV } from "@/lib/adminIaRoutes";

export default function FulfilmentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthWrapper allowedRoles={ADMIN_ONLY_ROLES}>
      <div className="min-h-screen page-canvas">
        <ModuleSubNav items={FULFILMENT_NAV} ariaLabel="Fulfilment sections" />
        {children}
      </div>
    </AuthWrapper>
  );
}
