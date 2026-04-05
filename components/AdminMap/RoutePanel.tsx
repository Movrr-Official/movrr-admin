"use client";

/**
 * RoutePanel — Route Management Mode Drill-In
 * Migrated and extended from the inline detail section of RouteLocationsMap.
 */

import { Badge } from "@/components/ui/badge";
import { X } from "lucide-react";
import type { RiderRoute } from "@/schemas";

const formatStatus = (s: string) =>
  ({ "in-progress": "In progress", assigned: "Assigned", completed: "Completed", cancelled: "Cancelled" }[s] ?? s);

const difficultyOf = (route: RiderRoute): string => {
  if (route.difficulty) return route.difficulty;
  if (route.performance === "high") return "Hard";
  if (route.performance === "medium") return "Medium";
  if (route.performance === "low") return "Easy";
  return "—";
};

export function RoutePanel({
  route,
  onClose,
}: {
  route: RiderRoute;
  onClose: () => void;
}) {
  const statusColor =
    route.status === "in-progress" ? "bg-emerald-100 text-emerald-800 border-emerald-200"
    : route.status === "assigned"    ? "bg-blue-100 text-blue-800 border-blue-200"
    : route.status === "completed"   ? "bg-slate-100 text-slate-700 border-slate-200"
    :                                  "bg-red-100 text-red-800 border-red-200";

  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-50 w-[min(640px,calc(100%-2rem))]
                    rounded-xl bg-background border border-border shadow-2xl overflow-hidden">
      <div className="flex items-start justify-between px-4 py-3 border-b border-border">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground truncate">{route.name}</p>
          {route.startLocation && route.endLocation && (
            <p className="text-xs text-muted-foreground mt-0.5">
              {route.startLocation} → {route.endLocation}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 ml-3 shrink-0">
          <Badge className={statusColor}>{formatStatus(route.status)}</Badge>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div className="px-4 py-3 grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4 text-xs">
        <Detail label="City" value={route.city ?? "—"} />
        <Detail label="Difficulty" value={difficultyOf(route)} />
        {typeof route.coverage === "number" && (
          <Detail label="Coverage" value={`${route.coverage}%`} />
        )}
        {route.zone && <Detail label="Zone" value={route.zone} />}
        {route.estimatedDuration && <Detail label="ETA" value={route.estimatedDuration} />}
        {route.startedAt && (
          <Detail label="Started" value={new Date(route.startedAt).toLocaleTimeString()} />
        )}
        {route.assignedDate && (
          <Detail label="Assigned" value={new Date(route.assignedDate).toLocaleDateString()} />
        )}
      </div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="font-medium text-foreground">{value}</p>
    </div>
  );
}
