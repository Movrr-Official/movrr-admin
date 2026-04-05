"use client";

/**
 * SessionPanel — Operations Mode Drill-In
 *
 * Shows live session stats, zone visit log, anti-spoof flags, and compliance
 * summary for a selected rider in Operations view mode.
 */

import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { X, ExternalLink, ShieldAlert, MapPin } from "lucide-react";
import type { RiderMapEntry } from "./types";

type ZoneVisit = {
  id: string;
  campaign_zone_id: string;
  entered_at: string;
  exited_at: string | null;
  dwell_time_s: number | null;
  impression_units: number;
  avg_speed_in_zone_kmh: number | null;
  speed_violation: boolean;
};

type SessionFlag = {
  id: string;
  flag_type: string;
  severity: "low" | "medium" | "high" | "critical";
  metadata: Record<string, unknown>;
  created_at: string;
};

type SessionDetail = {
  id: string;
  started_at: string;
  status: string;
  earning_mode: string;
  campaign_id: string | null;
  total_distance_meters: number | null;
  average_speed_kmh: number | null;
  route_name: string | null;
};

const SEVERITY_CLASS: Record<string, string> = {
  low:      "bg-yellow-50 text-yellow-700 border-yellow-200",
  medium:   "bg-orange-50 text-orange-700 border-orange-200",
  high:     "bg-red-50 text-red-700 border-red-200",
  critical: "bg-red-100 text-red-900 border-red-400 font-semibold",
};

export function SessionPanel({
  rider,
  onClose,
  onStartReplay,
}: {
  rider: RiderMapEntry;
  onClose: () => void;
  onStartReplay: (sessionId: string) => void;
}) {
  const supabase = createSupabaseBrowserClient();
  const [session, setSession] = useState<SessionDetail | null>(null);
  const [zoneVisits, setZoneVisits] = useState<ZoneVisit[]>([]);
  const [flags, setFlags] = useState<SessionFlag[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    setLoading(true);

    Promise.all([
      supabase
        .from("ride_session")
        .select(
          "id, started_at, status, earning_mode, campaign_id, total_distance_meters, average_speed_kmh, route_name",
        )
        .eq("id", rider.sessionId)
        .maybeSingle(),
      supabase
        .from("zone_visit")
        .select("*")
        .eq("session_id", rider.sessionId)
        .order("entered_at"),
      supabase
        .from("session_flag")
        .select("*")
        .eq("session_id", rider.sessionId)
        .eq("resolved", false)
        .order("created_at", { ascending: false }),
    ]).then(([sessionRes, visitsRes, flagsRes]) => {
      if (!mounted) return;
      setSession(sessionRes.data as SessionDetail | null);
      setZoneVisits((visitsRes.data ?? []) as ZoneVisit[]);
      setFlags((flagsRes.data ?? []) as SessionFlag[]);
      setLoading(false);
    });

    return () => { mounted = false; };
  }, [rider.sessionId]);

  const elapsedMin = session?.started_at
    ? Math.round((Date.now() - new Date(session.started_at).getTime()) / 60_000)
    : null;

  const totalImpressions = zoneVisits.reduce(
    (sum, v) => sum + (v.impression_units ?? 0), 0,
  );

  return (
    <div className="absolute top-2 right-2 z-50 w-80 max-h-[calc(100%-1rem)] flex flex-col rounded-xl bg-background border border-border shadow-2xl overflow-hidden">
      {/* Header */}
      <div className="flex items-start justify-between px-4 py-3 border-b border-border bg-muted/30">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground truncate">
            {session?.route_name ?? "Active Session"}
          </p>
          <p className="text-xs text-muted-foreground font-mono mt-0.5">
            {rider.sessionId.slice(0, 8)}…
          </p>
        </div>
        <button
          onClick={onClose}
          className="ml-2 mt-0.5 text-muted-foreground hover:text-foreground shrink-0"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="overflow-y-auto flex-1">
        {loading ? (
          <div className="p-4 text-sm text-muted-foreground">Loading…</div>
        ) : (
          <div className="divide-y divide-border">
            {/* Compliance badge */}
            <div className="px-4 py-3">
              <Badge
                className={
                  rider.complianceState === "compliant"
                    ? "bg-emerald-100 text-emerald-800 border-emerald-200"
                    : rider.complianceState === "non_compliant"
                      ? "bg-red-100 text-red-800 border-red-200"
                      : rider.complianceState === "paused"
                        ? "bg-gray-100 text-gray-700 border-gray-200"
                        : rider.complianceState === "under_review"
                          ? "bg-violet-100 text-violet-800 border-violet-200"
                          : "bg-amber-100 text-amber-800 border-amber-200"
                }
              >
                {rider.complianceState.replace(/_/g, " ")}
              </Badge>
            </div>

            {/* Live stats */}
            <div className="px-4 py-3 grid grid-cols-2 gap-2">
              <Stat label="Ride type" value={rider.rideType === "ad_enhanced_ride" ? "Campaign" : "Free ride"} />
              <Stat label="Speed" value={`${rider.speedKmh.toFixed(1)} km/h`} />
              {elapsedMin !== null && <Stat label="Duration" value={`${elapsedMin} min`} />}
              {session?.total_distance_meters != null && (
                <Stat label="Distance" value={`${(session.total_distance_meters / 1000).toFixed(2)} km`} />
              )}
              {rider.rewardPreview != null && (
                <Stat label="Reward est." value={`${rider.rewardPreview} pts`} />
              )}
              {totalImpressions > 0 && (
                <Stat label="Impressions" value={totalImpressions.toString()} />
              )}
              <Stat
                label="In zones"
                value={rider.currentZoneIds.length > 0 ? `${rider.currentZoneIds.length}` : "—"}
              />
            </div>

            {/* Zone visits */}
            {zoneVisits.length > 0 && (
              <div className="px-4 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2 flex items-center gap-1">
                  <MapPin className="h-3 w-3" /> Zone visits
                </p>
                <div className="space-y-1.5">
                  {zoneVisits.map((v) => (
                    <div
                      key={v.id}
                      className={`rounded-lg border px-2.5 py-1.5 text-xs ${
                        v.speed_violation
                          ? "bg-red-50 border-red-200"
                          : "bg-muted/40 border-border"
                      }`}
                    >
                      <div className="flex justify-between items-center">
                        <span className="font-mono text-muted-foreground">
                          {v.campaign_zone_id.slice(0, 8)}…
                        </span>
                        {v.speed_violation && (
                          <span className="text-red-600 text-[10px] font-medium">⚠ Speed</span>
                        )}
                        {!v.exited_at && (
                          <span className="text-emerald-600 text-[10px] font-medium animate-pulse">● Active</span>
                        )}
                      </div>
                      <div className="mt-0.5 text-muted-foreground">
                        {v.dwell_time_s != null ? `${v.dwell_time_s}s` : "open"}{" "}
                        · {v.impression_units} imp
                        {v.avg_speed_in_zone_kmh != null && ` · ${v.avg_speed_in_zone_kmh.toFixed(1)} km/h`}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Flags */}
            {flags.length > 0 && (
              <div className="px-4 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2 flex items-center gap-1">
                  <ShieldAlert className="h-3 w-3" /> Anti-spoof flags
                </p>
                <div className="space-y-1">
                  {flags.map((f) => (
                    <div
                      key={f.id}
                      className={`rounded border px-2 py-1 text-xs ${SEVERITY_CLASS[f.severity] ?? ""}`}
                    >
                      [{f.severity}] {f.flag_type.replace(/_/g, " ")}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer actions */}
      <div className="px-4 py-3 border-t border-border bg-muted/20 flex items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          className="flex-1 text-xs"
          onClick={() => onStartReplay(rider.sessionId)}
        >
          Replay session
        </Button>
        <a
          href={`/ride-sessions?session=${rider.sessionId}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className="text-sm font-medium text-foreground">{value}</p>
    </div>
  );
}
