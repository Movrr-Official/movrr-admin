"use client";

import { useQuery } from "@tanstack/react-query";
import { platformGet } from "@/lib/platformApi/client";
import type { FulfilmentReadModel } from "@/features/fulfilment/application/queries/fulfilmentQueries";
import type { FulfilmentEvent } from "@/features/fulfilment/domain/Fulfilment";

export type FulfilmentOpsFilters = {
  status?: string;
  type?: string;
  partnerOrgId?: string;
};

function buildListPath(filters?: FulfilmentOpsFilters): string {
  const params = new URLSearchParams();
  if (filters?.status?.trim()) params.set("status", filters.status.trim());
  if (filters?.type?.trim()) params.set("type", filters.type.trim());
  if (filters?.partnerOrgId?.trim()) {
    params.set("partnerOrgId", filters.partnerOrgId.trim());
  }
  const query = params.toString();
  return query ? `/api/v1/fulfilment?${query}` : "/api/v1/fulfilment";
}

export function useFulfilmentQueue(filters?: FulfilmentOpsFilters) {
  return useQuery<FulfilmentReadModel[]>({
    queryKey: ["fulfilment-ops-queue", filters],
    queryFn: async () => {
      const result = await platformGet<FulfilmentReadModel[]>(
        buildListPath(filters),
      );
      if (!result.ok) {
        throw new Error(result.message || "Failed to load fulfilment queue");
      }
      return result.value;
    },
  });
}

export function useFulfilmentDetail(id: string) {
  return useQuery<FulfilmentReadModel>({
    queryKey: ["fulfilment-ops-detail", id],
    enabled: Boolean(id),
    queryFn: async () => {
      const result = await platformGet<FulfilmentReadModel>(
        `/api/v1/fulfilment/${encodeURIComponent(id)}`,
      );
      if (!result.ok) {
        throw new Error(result.message || "Failed to load fulfilment");
      }
      return result.value;
    },
  });
}

export function useFulfilmentTimeline(id: string) {
  return useQuery<FulfilmentEvent[]>({
    queryKey: ["fulfilment-ops-timeline", id],
    enabled: Boolean(id),
    queryFn: async () => {
      const result = await platformGet<FulfilmentEvent[]>(
        `/api/v1/fulfilment/${encodeURIComponent(id)}/timeline`,
      );
      if (!result.ok) {
        throw new Error(result.message || "Failed to load timeline");
      }
      return result.value;
    },
  });
}
