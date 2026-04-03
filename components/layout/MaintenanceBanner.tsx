"use client";

import { useEffect, useState } from "react";
import { useSettingsData } from "@/hooks/useSettingsData";
import useShouldHideComponent from "@/hooks/useShouldHideComponent";

const MaintenanceBanner = () => {
  const shouldHide = useShouldHideComponent();
  const { data } = useSettingsData({
    refetchInterval: 1000 * 60,
    enabled: !shouldHide,
  });
  const [dismissed, setDismissed] = useState(false);

  const maintenanceMode = data?.values?.general?.maintenanceMode;
  const maintenanceScope = data?.values?.general?.maintenanceScope ?? "global";
  const maintenanceMessage = data?.values?.general?.maintenanceMessage?.trim();

  // Global scope is non-dismissible — it means the entire platform is blocked.
  const canDismiss = maintenanceScope !== "global";

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.sessionStorage.getItem("adminMaintenanceBanner");
    setDismissed(stored === "dismissed");
  }, []);

  // Reset dismissed state whenever maintenance mode turns off.
  useEffect(() => {
    if (!maintenanceMode) {
      setDismissed(false);
      if (typeof window !== "undefined") {
        window.sessionStorage.removeItem("adminMaintenanceBanner");
      }
    }
  }, [maintenanceMode]);

  // Also reset dismissed state when scope changes to global (non-dismissible).
  useEffect(() => {
    if (maintenanceScope === "global" && dismissed) {
      setDismissed(false);
      if (typeof window !== "undefined") {
        window.sessionStorage.removeItem("adminMaintenanceBanner");
      }
    }
  }, [maintenanceScope, dismissed]);

  if (shouldHide || !maintenanceMode || dismissed) {
    return null;
  }

  const scopeLabel: Record<string, string> = {
    global: "Global",
    rewards_only: "Rewards only",
    onboarding_only: "Onboarding only",
    sessions_only: "Sessions only",
  };

  const defaultMessage =
    "Admin dashboard updates are in progress. You can continue browsing, but some actions may be temporarily limited.";

  return (
    <div className="w-full bg-warning/15 text-warning-foreground border-b border-warning/30">
      <div className="mx-auto w-full px-4 sm:px-6 py-1.5 text-xs flex items-center justify-between gap-3">
        <div className="flex items-center justify-center gap-2">
          <span className="font-semibold uppercase tracking-wide">
            Maintenance
          </span>
          {maintenanceScope !== "global" && (
            <span className="rounded bg-warning/20 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide">
              {scopeLabel[maintenanceScope] ?? maintenanceScope}
            </span>
          )}
          <span className="opacity-90">
            {maintenanceMessage || defaultMessage}
          </span>
        </div>
        {canDismiss && (
          <button
            type="button"
            className="rounded px-2 py-0.5 text-[11px] font-semibold border border-warning/40 hover:bg-warning/20 transition"
            onClick={() => {
              setDismissed(true);
              if (typeof window !== "undefined") {
                window.sessionStorage.setItem(
                  "adminMaintenanceBanner",
                  "dismissed",
                );
              }
            }}
            aria-label="Dismiss maintenance banner"
          >
            Dismiss
          </button>
        )}
      </div>
    </div>
  );
};

export default MaintenanceBanner;
