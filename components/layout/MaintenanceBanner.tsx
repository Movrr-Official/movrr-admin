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

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.sessionStorage.getItem("adminMaintenanceBanner");
    setDismissed(stored === "dismissed");
  }, []);

  useEffect(() => {
    if (!data?.values?.general?.maintenanceMode) {
      setDismissed(false);
      if (typeof window !== "undefined") {
        window.sessionStorage.removeItem("adminMaintenanceBanner");
      }
    }
  }, [data?.values?.general?.maintenanceMode]);

  if (shouldHide || !data?.values?.general?.maintenanceMode || dismissed) {
    return null;
  }

  return (
    <div className="w-full bg-warning/15 text-warning-foreground border-b border-warning/30">
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
      </div>
    </div>
  );
};

export default MaintenanceBanner;
