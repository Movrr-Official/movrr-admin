"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { platformGet, platformPost } from "@/lib/platformApi/client";

/** Client read model for resource pool rows from Platform API. */
export type ResourcePoolReadModel = {
  id: string;
  name?: string | null;
  resourceKind?: string | null;
  status?: string | null;
  partnerOrgId?: string | null;
  availableCount?: number;
  reservedCount?: number;
  fulfilledCount?: number;
  health?: string | null;
  exhausted?: boolean;
};

export type ImportPoolCodesInput = {
  resourceId: string;
  codes: string[];
};

export function useResourcePools() {
  return useQuery<ResourcePoolReadModel[]>({
    queryKey: ["resource-pools"],
    queryFn: async () => {
      const result = await platformGet<ResourcePoolReadModel[]>(
        "/api/v1/partners/resources",
      );
      if (!result.ok) {
        throw new Error(result.message || "Failed to load resource pools");
      }
      return result.value;
    },
  });
}

export function useImportPoolCodes() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: ImportPoolCodesInput) => {
      const result = await platformPost<{
        resourceId: string;
        imported: number;
        accepted: boolean;
      }>("/api/v1/partners/resources", {
        headers: {
          "Idempotency-Key": crypto.randomUUID(),
        },
        body: {
          resourceId: input.resourceId,
          codes: input.codes,
        },
      });
      if (!result.ok) {
        throw new Error(result.message || "Failed to import pool codes");
      }
      return result.value;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["resource-pools"] });
    },
  });
}
