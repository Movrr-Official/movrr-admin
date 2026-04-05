"use client";

/**
 * useAdminMapData — Unified Map Data Hook
 *
 * Merges two data sources into a single Map<sessionId, RiderMapEntry>:
 *
 *  1. Supabase Realtime broadcast (`admin:rider_positions`) — pushed by the
 *     GPS ingest API after every batch. Provides compliance state, zone IDs,
 *     reward preview. Source of truth for operations mode.
 *
 *  2. route_tracking poll (`useRiderLocations` pattern) — provides route-tied
 *     positions for riders on assigned routes. Source of truth for route
 *     management mode. Falls back gracefully when Realtime is unavailable.
 *
 * Merge rule: for the same rider, Realtime data takes precedence over the poll
 * when it is fresher (updatedAt comparison). Both are retained until the other
 * source confirms the same session, avoiding flash-of-missing-rider on
 * reconnect.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createSupabaseBrowserClient } from "@/lib/supabase-client";
import type { RiderMapEntry, ComplianceState } from "./types";
import { COMPLIANCE_COLORS, ROUTE_STATUS_COLORS } from "./layers";
import type { RiderRoute } from "@/schemas";

const SIGNAL_LOSS_MS = 60_000;
const TRAIL_MAX_POINTS = 12;
const POLL_INTERVAL_MS = 15_000;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function deriveComplianceColor(state: ComplianceState): string {
  return COMPLIANCE_COLORS[state] ?? "#94a3b8";
}

function routeStatusToCompliance(status: string): ComplianceState {
  if (status === "in-progress") return "compliant";
  if (status === "assigned") return "marginal";
  return "signal_lost";
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export type UseAdminMapDataOptions = {
  routes?: RiderRoute[];
  /**
   * When false, all Supabase queries and Realtime subscriptions are skipped and
   * the hook immediately returns an empty riders map. Use this to prevent real
   * data from being fetched in mock mode.
   * @default true
   */
  enabled?: boolean;
};

export type AdminMapData = {
  riders: Map<string, RiderMapEntry>;
  isLoading: boolean;
  error: Error | null;
  /** Revalidate the polling source immediately. */
  refetch: () => void;
};

export function useAdminMapData({ routes = [], enabled = true }: UseAdminMapDataOptions): AdminMapData {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const queryClient = useQueryClient();

  // Realtime state — maintained in a ref to avoid re-render on every push,
  // then merged into the riders map on a 1s animation-frame tick.
  const realtimeRef = useRef<Map<string, RiderMapEntry>>(new Map());
  const trailsRef = useRef<Map<string, [number, number][]>>(new Map());

  // Derived riders map — the output of the hook
  const [riders, setRiders] = useState<Map<string, RiderMapEntry>>(new Map());
  const [error, setError] = useState<Error | null>(null);

  // Active route IDs for the polling query
  const activeRouteIds = useMemo(
    () =>
      routes
        .filter((r) => ["assigned", "in-progress"].includes(r.status))
        .map((r) => r.id),
    [routes],
  );

  const routeLookup = useMemo(
    () => new Map(routes.map((r) => [r.id, r])),
    [routes],
  );

  // ── Polling source (route_tracking) ────────────────────────────────────────
  const { data: polledLocations = [], isLoading } = useQuery({
    queryKey: ["admin-map-route-tracking", activeRouteIds],
    queryFn: async () => {
      if (activeRouteIds.length === 0) return [];
      let q = supabase
        .from("route_tracking")
        .select("id, route_id, rider_id, path, created_at, updated_at")
        .order("updated_at", { ascending: false })
        .limit(300);
      if (activeRouteIds.length > 0) {
        q = q.in("route_id", activeRouteIds);
      }
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
    staleTime: POLL_INTERVAL_MS,
    refetchInterval: POLL_INTERVAL_MS,
    enabled: enabled && activeRouteIds.length > 0,
  });

  // ── Merge polling data into riders map ─────────────────────────────────────
  useEffect(() => {
    const latestByRoute = new Map<string, any>();
    for (const record of polledLocations) {
      const routeId = record.route_id;
      if (!routeId || latestByRoute.has(routeId)) continue;
      const path = Array.isArray(record.path) ? record.path : [];
      const last = path[path.length - 1];
      const lat = last?.lat ?? last?.latitude;
      const lng = last?.lng ?? last?.longitude;
      if (typeof lat !== "number" || typeof lng !== "number") continue;
      latestByRoute.set(routeId, { ...record, lat, lng });
    }

    setRiders((prev) => {
      const next = new Map(prev);

      // Inject polled locations as base entries (will be overridden by Realtime if fresher)
      latestByRoute.forEach((record, routeId) => {
        const route = routeLookup.get(routeId);
        // Use routeId as sessionId fallback — Realtime will supersede with real sessionId
        const existingKey = [...next.entries()].find(
          ([, e]) => e.routeId === routeId,
        )?.[0];
        const key = existingKey ?? `route-${routeId}`;

        const existing = next.get(key);
        const recordTime = record.updated_at ?? record.created_at ?? "";
        if (existing && existing.updatedAt > recordTime) return; // Realtime is fresher

        next.set(key, {
          sessionId: key,
          riderId: record.rider_id ?? "",
          lat: record.lat,
          lon: record.lng,
          speedKmh: 0,
          heading: null,
          complianceState: routeStatusToCompliance(route?.status ?? "assigned"),
          rideType: "standard_ride",
          campaignId: null,
          currentZoneIds: [],
          rewardPreview: null,
          updatedAt: recordTime,
          routeId,
          routeLabel: route?.name ?? routeId,
          routeStatus: route?.status ?? "assigned",
          city: route?.city ?? null,
          trail: [],
        });
      });

      // Apply signal-loss detection
      const now = Date.now();
      next.forEach((rider, key) => {
        const age = now - new Date(rider.updatedAt).getTime();
        if (age > SIGNAL_LOSS_MS && rider.complianceState !== "signal_lost") {
          next.set(key, { ...rider, complianceState: "signal_lost" });
        }
      });

      return next;
    });
  }, [polledLocations, routeLookup]);

  // ── Realtime subscription ──────────────────────────────────────────────────
  useEffect(() => {
    if (!enabled) return;

    const channel = supabase
      .channel("admin:rider_positions")
      .on("broadcast", { event: "rider_position" }, ({ payload }) => {
        if (!payload?.session_id) return;

        const entry = payload as {
          session_id: string;
          rider_id: string;
          lat: number;
          lon: number;
          speed_kmh: number;
          heading: number | null;
          compliance_state: ComplianceState;
          ride_type: string;
          campaign_id: string | null;
          current_zone_ids: string[];
          reward_preview: number | null;
          updated_at: string;
        };

        // Maintain trail
        const trail = trailsRef.current.get(entry.session_id) ?? [];
        trail.push([entry.lon, entry.lat]);
        if (trail.length > TRAIL_MAX_POINTS) trail.shift();
        trailsRef.current.set(entry.session_id, trail);

        setRiders((prev) => {
          const next = new Map(prev);
          const existing = next.get(entry.session_id);
          next.set(entry.session_id, {
            sessionId: entry.session_id,
            riderId: entry.rider_id,
            lat: entry.lat,
            lon: entry.lon,
            speedKmh: entry.speed_kmh,
            heading: entry.heading,
            complianceState: entry.compliance_state,
            rideType: entry.ride_type,
            campaignId: entry.campaign_id,
            currentZoneIds: entry.current_zone_ids,
            rewardPreview: entry.reward_preview,
            updatedAt: entry.updated_at,
            // Preserve route management fields if already present
            routeId: existing?.routeId ?? null,
            routeLabel: existing?.routeLabel ?? null,
            routeStatus: existing?.routeStatus ?? null,
            city: existing?.city ?? null,
            trail: [...trail],
          });
          return next;
        });
      })
      .subscribe((status, err) => {
        if (err) setError(err instanceof Error ? err : new Error(String(err)));
      });

    // Also subscribe to route_tracking postgres_changes for polling invalidation
    const pollChannel = supabase
      .channel("route-tracking-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "route_tracking" },
        () => {
          queryClient.invalidateQueries({
            queryKey: ["admin-map-route-tracking"],
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      supabase.removeChannel(pollChannel);
    };
  }, [enabled, supabase, queryClient]);

  // ── Signal loss ticker ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!enabled) return;
    const interval = setInterval(() => {
      const now = Date.now();
      setRiders((prev) => {
        let changed = false;
        const next = new Map(prev);
        next.forEach((rider, key) => {
          const age = now - new Date(rider.updatedAt).getTime();
          if (age > SIGNAL_LOSS_MS && rider.complianceState !== "signal_lost") {
            next.set(key, { ...rider, complianceState: "signal_lost" });
            changed = true;
          }
        });
        return changed ? next : prev;
      });
    }, 10_000);
    return () => clearInterval(interval);
  }, [enabled]);

  const refetch = () => {
    queryClient.invalidateQueries({ queryKey: ["admin-map-route-tracking"] });
  };

  return { riders, isLoading, error, refetch };
}
