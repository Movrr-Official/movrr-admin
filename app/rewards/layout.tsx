import { Suspense } from "react";
import { ModuleSubNav } from "@/components/layout/ModuleSubNav";
import { REWARDS_NAV } from "@/lib/adminIaRoutes";

export default function RewardsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen page-canvas">
      <Suspense fallback={<div className="mb-6 h-9 border-b border-border" />}>
        <ModuleSubNav
          items={REWARDS_NAV}
          ariaLabel="Rewards sections"
          sectionParam="section"
        />
      </Suspense>
      {children}
    </div>
  );
}
