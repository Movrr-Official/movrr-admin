"use client";

import { useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createSupabaseBrowserClient } from "@/lib/supabase-client";

export type RiderLocationPoint = {
  id: string;
  routeId?: string | null;
  riderId?: string | null;
  lat: number;
  lng: number;
  recordedAt?: string | null;
};

type RawLocationRecord = {
  id?: string | null;
  route_id?: string | null;
  rider_id?: string | null;
  path?: Array<{
    lat?: number;
    lng?: number;
    latitude?: number;
    longitude?: number;
  }> | null;
  created_at?: string | null;
  updated_at?: string | null;
};

const normalizeLocation = (
  record: RawLocationRecord,
): RiderLocationPoint | null => {
  const path = Array.isArray(record.path) ? record.path : [];
  const lastPoint = path.length ? path[path.length - 1] : null;
  const lat = lastPoint?.lat ?? lastPoint?.latitude ?? null;
  const lng = lastPoint?.lng ?? lastPoint?.longitude ?? null;

  if (typeof lat !== "number" || typeof lng !== "number") {
    return null;
  }

  return {
    id:
      record.id ??
      `${record.route_id ?? "route"}-${record.rider_id ?? "rider"}-${record.updated_at ?? record.created_at ?? ""}`,
    routeId: record.route_id ?? null,
    riderId: record.rider_id ?? null,
    lat,
    lng,
    recordedAt: record.updated_at ?? record.created_at ?? null,
  };
};

export const useRiderLocations = (routeIds: string[]) => {
  const queryClient = useQueryClient();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const normalizedRouteIds = useMemo(
    () => Array.from(new Set(routeIds)).sort(),
    [routeIds],
  );

  const queryKey = ["rider-locations", normalizedRouteIds];

  const query = useQuery<RiderLocationPoint[]>({
    queryKey,
    queryFn: async () => {
      const buildQuery = (withOrder: boolean) => {
        let queryBuilder = supabase
          .from("route_tracking")
          .select("id, route_id, rider_id, path, created_at, updated_at")
          .limit(300);

        if (normalizedRouteIds.length > 0) {
          queryBuilder = queryBuilder.in("route_id", normalizedRouteIds);
        }

        if (withOrder) {
          queryBuilder = queryBuilder.order("updated_at", { ascending: false });
        }

        return queryBuilder;
      };

      const { data, error } = await buildQuery(true);

      if (error) {
        const { data: fallbackData, error: fallbackError } =
          await buildQuery(false);

        if (fallbackError) {
          throw fallbackError;
        }

        const fallbackPoints = (fallbackData as RawLocationRecord[]) ?? [];
        const latestByRoute = new Map<string, RiderLocationPoint>();

        fallbackPoints
          .map((record) => normalizeLocation(record))
          .filter(Boolean)
          .sort((a, b) => {
            const aTime = a?.recordedAt ? new Date(a.recordedAt).getTime() : 0;
            const bTime = b?.recordedAt ? new Date(b.recordedAt).getTime() : 0;
            return bTime - aTime;
          })
          .forEach((point) => {
            if (!point?.routeId) return;
            if (!latestByRoute.has(point.routeId)) {
              latestByRoute.set(point.routeId, point);
            }
          });

        return Array.from(latestByRoute.values());
      }

      const latestByRoute = new Map<string, RiderLocationPoint>();

      (data as RawLocationRecord[])
        .map((record) => normalizeLocation(record))
        .filter(Boolean)
        .sort((a, b) => {
          const aTime = a?.recordedAt ? new Date(a.recordedAt).getTime() : 0;
          const bTime = b?.recordedAt ? new Date(b.recordedAt).getTime() : 0;
          return bTime - aTime;
        })
        .forEach((point) => {
          if (!point?.routeId) return;
          if (!latestByRoute.has(point.routeId)) {
            latestByRoute.set(point.routeId, point);
          }
        });

      return Array.from(latestByRoute.values());
    },
    staleTime: 1000 * 5,
    refetchInterval: 1000 * 15,
  });

  useEffect(() => {
    const channel = supabase
      .channel("route-gps-points-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "route_tracking" },
        () => {
          queryClient.invalidateQueries({ queryKey });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [normalizedRouteIds.length, queryClient, queryKey, supabase]);

  return query;
};
