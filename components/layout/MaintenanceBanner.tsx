"use client";

import { useEffect, useState } from "react";
import { useSettingsData } from "@/hooks/useSettingsData";
import useShouldHideComponent from "@/hooks/useShouldHideComponent";

const MaintenanceBanner = () => {
  const shouldHide = useShouldHideComponent();
  const { data } = useSettingsData({ refetchInterval: 1000 * 60 });
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.sessionStorage.getItem("adminMaintenanceBanner");
    setDismissed(stored === "dismissed");
  }, []);

  useEffect(() => {
    if (!data?.system?.maintenanceMode) {
      setDismissed(false);
      if (typeof window !== "undefined") {
        window.sessionStorage.removeItem("adminMaintenanceBanner");
      }
    }
  }, [data?.system?.maintenanceMode]);

  if (shouldHide || !data?.system?.maintenanceMode || dismissed) {
    return null;
  }

  return (
    <div className="w-full bg-amber-500/15 text-amber-900 dark:text-amber-200 border-b border-amber-500/30">
      <div className="mx-auto w-full px-4 sm:px-6 py-1.5 text-xs flex items-center justify-between gap-3">
        <div className="flex items-center justify-center gap-2">
          <span className="font-semibold uppercase tracking-wide">
            Maintenance
          </span>
          <span className="opacity-90">
            Admin dashboard updates are in progress. You can continue browsing,
            but some actions may be temporarily limited.
          </span>
        </div>
        <button
          type="button"
          className="rounded px-2 py-0.5 text-[11px] font-semibold border border-amber-500/40 hover:bg-amber-500/20 transition"
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
      </div>
    </div>
  );
};

export default MaintenanceBanner;
