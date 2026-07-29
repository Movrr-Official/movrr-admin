import AuthWrapper from "@/components/auth/AuthWrapper";
import { Suspense } from "react";
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
        <Suspense fallback={<div className="mb-6 h-9 border-b border-border" />}>
          <ModuleSubNav items={FULFILMENT_NAV} ariaLabel="Fulfilment sections" />
        </Suspense>
        {children}
      </div>
    </AuthWrapper>
  );
}
