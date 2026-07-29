"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { platformGet, platformPost } from "@/lib/platformApi/client";
import type { FulfilmentReadModel } from "@/features/fulfilment/application/queries/fulfilmentQueries";
import type { FulfilmentEvent } from "@/features/fulfilment/domain/Fulfilment";

export type FulfilmentOpsFilters = {
  status?: string;
  type?: string;
  partnerOrgId?: string;
};

export type FulfilmentActionInput = {
  id: string;
  reason: string;
  expectedVersion: number;
};

export class PlatformApiClientError extends Error {
  kind: string;
  status: number;

  constructor(kind: string, message: string, status: number) {
    super(message);
    this.name = "PlatformApiClientError";
    this.kind = kind;
    this.status = status;
  }
}

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

function invalidateFulfilmentQueries(
  queryClient: ReturnType<typeof useQueryClient>,
  id: string,
) {
  void queryClient.invalidateQueries({ queryKey: ["fulfilment-ops-queue"] });
  void queryClient.invalidateQueries({
    queryKey: ["fulfilment-ops-detail", id],
  });
  void queryClient.invalidateQueries({
    queryKey: ["fulfilment-ops-timeline", id],
  });
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

async function postFulfilmentAction(
  action: "cancel" | "refund",
  input: FulfilmentActionInput,
): Promise<unknown> {
  const result = await platformPost<unknown>(
    `/api/v1/fulfilment/${encodeURIComponent(input.id)}/${action}`,
    {
      headers: {
        "Idempotency-Key": crypto.randomUUID(),
      },
      body: {
        reason: input.reason,
        expectedVersion: input.expectedVersion,
      },
    },
  );
  if (!result.ok) {
    throw new PlatformApiClientError(
      result.kind,
      result.message || `Failed to ${action} fulfilment`,
      result.status,
    );
  }
  return result.value;
}

export function useCancelFulfilment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: FulfilmentActionInput) =>
      postFulfilmentAction("cancel", input),
    onSuccess: (_data, variables) => {
      invalidateFulfilmentQueries(queryClient, variables.id);
    },
    onError: (error, variables) => {
      if (
        error instanceof PlatformApiClientError &&
        error.kind === "ConcurrencyConflict"
      ) {
        invalidateFulfilmentQueries(queryClient, variables.id);
      }
    },
  });
}

export function useRefundFulfilment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: FulfilmentActionInput) =>
      postFulfilmentAction("refund", input),
    onSuccess: (_data, variables) => {
      invalidateFulfilmentQueries(queryClient, variables.id);
    },
    onError: (error, variables) => {
      if (
        error instanceof PlatformApiClientError &&
        error.kind === "ConcurrencyConflict"
      ) {
        invalidateFulfilmentQueries(queryClient, variables.id);
      }
    },
  });
}
