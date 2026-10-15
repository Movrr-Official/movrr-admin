import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import {
  fail,
  ok,
  type ApplicationResult,
} from "@/lib/result/ApplicationResult";
import type {
  AllocateResourceInput,
  AllocationLifecycleInput,
  FulfilmentResourceProvider,
  ResourceAllocationResult,
} from "@/features/fulfilment/application/contracts/FulfilmentResourceProvider";
import type { GeneratedDigitalResourceProvider } from "@/features/fulfilment/infrastructure/providers/GeneratedDigitalResourceProvider";

function throwOnError(error: { message: string } | null, action: string): void {
  if (error) throw new Error(`${action}: ${error.message}`);
}

/**
 * Durable generated-digital allocations via fulfilment_resource_allocation.
 * Codes live in allocation metadata (no pool items).
 */
export function createSupabaseGeneratedDigitalResourceProvider(): GeneratedDigitalResourceProvider {
  const provider: FulfilmentResourceProvider = {
    async allocate(
      input: AllocateResourceInput,
    ): Promise<ApplicationResult<ResourceAllocationResult>> {
      const { data, error } = await createSupabaseAdminClient().rpc(
        "allocate_reward_resource",
        {
          p_fulfilment_id: input.fulfilmentId,
          p_resource_id: input.resourceId,
        },
      );
      if (error) {
        if (error.code === "22023")
          return fail("BusinessFailure", error.message);
        throw new Error(`Resource allocation failed: ${error.message}`);
      }
      return ok(data as ResourceAllocationResult);
    },

    async release(
      input: AllocationLifecycleInput,
    ): Promise<ApplicationResult<ResourceAllocationResult>> {
      const supabase = createSupabaseAdminClient();
      const { data: allocation, error } = await supabase
        .from("fulfilment_resource_allocation")
        .select("id, fulfilment_id, resource_id, status, metadata")
        .eq("id", input.allocationId)
        .eq("resource_id", input.resourceId)
        .maybeSingle();
      throwOnError(error, "generated.release.lookup");
      if (!allocation || allocation.status !== "reserved") {
        return fail("BusinessFailure", "Allocation not found or not reserved");
      }

      const { error: updError } = await supabase
        .from("fulfilment_resource_allocation")
        .update({
          status: "released",
          released_at: new Date().toISOString(),
        })
        .eq("id", input.allocationId);
      throwOnError(updError, "generated.release");

      const meta = allocation.metadata as {
        code?: string;
        resourceItemId?: string;
      } | null;

      return ok({
        allocationId: input.allocationId,
        fulfilmentId: String(allocation.fulfilment_id),
        resourceId: input.resourceId,
        resourceItemId: meta?.resourceItemId ?? null,
        status: "released",
        code: typeof meta?.code === "string" ? meta.code : null,
      });
    },

    async fulfil(
      input: AllocationLifecycleInput,
    ): Promise<ApplicationResult<ResourceAllocationResult>> {
      const supabase = createSupabaseAdminClient();
      const { data: allocation, error } = await supabase
        .from("fulfilment_resource_allocation")
        .select("id, fulfilment_id, resource_id, status, metadata")
        .eq("id", input.allocationId)
        .eq("resource_id", input.resourceId)
        .maybeSingle();
      throwOnError(error, "generated.fulfil.lookup");
      if (
        !allocation ||
        !["reserved", "fulfilled"].includes(allocation.status)
      ) {
        return fail("BusinessFailure", "Allocation not found or not reserved");
      }

      const { error: updError } = await supabase
        .from("fulfilment_resource_allocation")
        .update({
          status: "fulfilled",
          fulfilled_at: new Date().toISOString(),
        })
        .eq("id", input.allocationId);
      throwOnError(updError, "generated.fulfil");

      const meta = allocation.metadata as {
        code?: string;
        resourceItemId?: string;
      } | null;

      return ok({
        allocationId: input.allocationId,
        fulfilmentId: String(allocation.fulfilment_id),
        resourceId: input.resourceId,
        resourceItemId: meta?.resourceItemId ?? null,
        status: "fulfilled",
        code: typeof meta?.code === "string" ? meta.code : null,
      });
    },
  };

  return provider;
}
