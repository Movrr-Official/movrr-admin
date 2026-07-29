import "server-only";

import { randomBytes, randomUUID } from "crypto";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { fail, ok, type ApplicationResult } from "@/lib/result/ApplicationResult";
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

function generateUniqueCode(): string {
  return `MOVRR-${randomBytes(8).toString("hex").toUpperCase()}`;
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
      const supabase = createSupabaseAdminClient();
      const code = generateUniqueCode();
      const allocationId = randomUUID();
      const resourceItemId = randomUUID();

      const { error: upsertResourceError } = await supabase
        .from("fulfilment_resource")
        .upsert(
          {
            id: input.resourceId,
            resource_kind: "generated_digital",
            name: `Generated ${input.resourceId.slice(0, 8)}`,
            status: "active",
            updated_at: new Date().toISOString(),
          },
          { onConflict: "id" },
        );
      throwOnError(upsertResourceError, "generated.allocate.resource");

      const { error } = await supabase
        .from("fulfilment_resource_allocation")
        .insert({
          id: allocationId,
          fulfilment_id: input.fulfilmentId,
          resource_id: input.resourceId,
          resource_item_id: null,
          status: "reserved",
          metadata: { code, resourceItemId },
        });
      throwOnError(error, "generated.allocate");

      return ok({
        allocationId,
        fulfilmentId: input.fulfilmentId,
        resourceId: input.resourceId,
        resourceItemId,
        status: "reserved",
        code,
      });
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
        resourceItemId: meta?.resourceItemId,
        status: "released",
        code: typeof meta?.code === "string" ? meta.code : undefined,
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
      if (!allocation || allocation.status !== "reserved") {
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
        resourceItemId: meta?.resourceItemId,
        status: "fulfilled",
        code: typeof meta?.code === "string" ? meta.code : undefined,
      });
    },
  };

  return provider;
}
