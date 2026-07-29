import "server-only";

import { createHash, randomUUID } from "crypto";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { fail, ok, type ApplicationResult } from "@/lib/result/ApplicationResult";
import type {
  AllocateResourceInput,
  AllocationLifecycleInput,
  FulfilmentResourceProvider,
  ResourceAllocationResult,
} from "@/features/fulfilment/application/contracts/FulfilmentResourceProvider";
import type { VoucherPoolResourceProvider } from "@/features/fulfilment/infrastructure/providers/VoucherPoolResourceProvider";

function throwOnError(error: { message: string } | null, action: string): void {
  if (error) throw new Error(`${action}: ${error.message}`);
}

function hashCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

/**
 * Durable voucher pool backed by fulfilment_resource / _item / _allocation.
 * seedPool upserts a voucher_pool resource and available items (tests/ops import).
 */
export function createSupabaseVoucherPoolResourceProvider(): VoucherPoolResourceProvider {
  const provider: FulfilmentResourceProvider & VoucherPoolResourceProvider = {
    async seedPool(resourceId, items) {
      const supabase = createSupabaseAdminClient();
      const { error: upsertResourceError } = await supabase
        .from("fulfilment_resource")
        .upsert(
          {
            id: resourceId,
            resource_kind: "voucher_pool",
            name: `Pool ${resourceId.slice(0, 8)}`,
            status: "active",
            updated_at: new Date().toISOString(),
          },
          { onConflict: "id" },
        );
      throwOnError(upsertResourceError, "seedPool.resource");

      if (items.length === 0) return;
      const { error: itemsError } = await supabase
        .from("fulfilment_resource_item")
        .upsert(
          items.map((item) => ({
            id: item.id,
            resource_id: resourceId,
            external_code_hash: hashCode(item.code),
            display_payload: { code: item.code },
            status: "available",
            updated_at: new Date().toISOString(),
          })),
          { onConflict: "id" },
        );
      throwOnError(itemsError, "seedPool.items");
    },

    async allocate(
      input: AllocateResourceInput,
    ): Promise<ApplicationResult<ResourceAllocationResult>> {
      const supabase = createSupabaseAdminClient();
      const { data: item, error: itemError } = await supabase
        .from("fulfilment_resource_item")
        .select("id, display_payload, status")
        .eq("resource_id", input.resourceId)
        .eq("status", "available")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      throwOnError(itemError, "allocate.lookup");
      if (!item) {
        return fail("BusinessFailure", "No available items in voucher pool");
      }

      const { data: reserved, error: reserveError } = await supabase
        .from("fulfilment_resource_item")
        .update({
          status: "reserved",
          updated_at: new Date().toISOString(),
        })
        .eq("id", item.id)
        .eq("status", "available")
        .select("id, display_payload")
        .maybeSingle();
      throwOnError(reserveError, "allocate.reserve");
      if (!reserved) {
        return fail("BusinessFailure", "No available items in voucher pool");
      }

      const allocationId = randomUUID();
      const code =
        typeof (reserved.display_payload as { code?: string } | null)?.code ===
        "string"
          ? (reserved.display_payload as { code: string }).code
          : undefined;

      const { error: allocError } = await supabase
        .from("fulfilment_resource_allocation")
        .insert({
          id: allocationId,
          fulfilment_id: input.fulfilmentId,
          resource_id: input.resourceId,
          resource_item_id: reserved.id,
          status: "reserved",
          metadata: code ? { code } : {},
        });
      throwOnError(allocError, "allocate.insert");

      return ok({
        allocationId,
        fulfilmentId: input.fulfilmentId,
        resourceId: input.resourceId,
        resourceItemId: String(reserved.id),
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
        .select("id, fulfilment_id, resource_id, resource_item_id, status, metadata")
        .eq("id", input.allocationId)
        .eq("resource_id", input.resourceId)
        .maybeSingle();
      throwOnError(error, "release.lookup");
      if (!allocation || allocation.status !== "reserved") {
        return fail("BusinessFailure", "Allocation not found or not reserved");
      }

      if (allocation.resource_item_id) {
        await supabase
          .from("fulfilment_resource_item")
          .update({
            status: "available",
            updated_at: new Date().toISOString(),
          })
          .eq("id", allocation.resource_item_id);
      }

      const { error: updError } = await supabase
        .from("fulfilment_resource_allocation")
        .update({
          status: "released",
          released_at: new Date().toISOString(),
        })
        .eq("id", input.allocationId);
      throwOnError(updError, "release.update");

      return ok({
        allocationId: input.allocationId,
        fulfilmentId: String(allocation.fulfilment_id),
        resourceId: input.resourceId,
        resourceItemId: allocation.resource_item_id
          ? String(allocation.resource_item_id)
          : undefined,
        status: "released",
        code:
          typeof (allocation.metadata as { code?: string } | null)?.code ===
          "string"
            ? (allocation.metadata as { code: string }).code
            : undefined,
      });
    },

    async fulfil(
      input: AllocationLifecycleInput,
    ): Promise<ApplicationResult<ResourceAllocationResult>> {
      const supabase = createSupabaseAdminClient();
      const { data: allocation, error } = await supabase
        .from("fulfilment_resource_allocation")
        .select("id, fulfilment_id, resource_id, resource_item_id, status, metadata")
        .eq("id", input.allocationId)
        .eq("resource_id", input.resourceId)
        .maybeSingle();
      throwOnError(error, "fulfil.lookup");
      if (!allocation || allocation.status !== "reserved") {
        return fail("BusinessFailure", "Allocation not found or not reserved");
      }

      if (allocation.resource_item_id) {
        await supabase
          .from("fulfilment_resource_item")
          .update({
            status: "fulfilled",
            updated_at: new Date().toISOString(),
          })
          .eq("id", allocation.resource_item_id);
      }

      const { error: updError } = await supabase
        .from("fulfilment_resource_allocation")
        .update({
          status: "fulfilled",
          fulfilled_at: new Date().toISOString(),
        })
        .eq("id", input.allocationId);
      throwOnError(updError, "fulfil.update");

      return ok({
        allocationId: input.allocationId,
        fulfilmentId: String(allocation.fulfilment_id),
        resourceId: input.resourceId,
        resourceItemId: allocation.resource_item_id
          ? String(allocation.resource_item_id)
          : undefined,
        status: "fulfilled",
        code:
          typeof (allocation.metadata as { code?: string } | null)?.code ===
          "string"
            ? (allocation.metadata as { code: string }).code
            : undefined,
      });
    },
  };

  return provider;
}

export async function importVoucherPoolCodes(input: {
  resourceId: string;
  codes: string[];
  partnerOrgId?: string | null;
}): Promise<{ resourceId: string; imported: number }> {
  const supabase = createSupabaseAdminClient();
  const { error: upsertResourceError } = await supabase
    .from("fulfilment_resource")
    .upsert(
      {
        id: input.resourceId,
        partner_org_id: input.partnerOrgId ?? null,
        resource_kind: "voucher_pool",
        name: `Pool ${input.resourceId.slice(0, 8)}`,
        status: "active",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    );
  throwOnError(upsertResourceError, "import.resource");

  const rows = input.codes.map((code) => ({
    id: randomUUID(),
    resource_id: input.resourceId,
    external_code_hash: hashCode(code.trim()),
    display_payload: { code: code.trim() },
    status: "available",
  }));

  if (rows.length > 0) {
    const { error } = await supabase.from("fulfilment_resource_item").insert(rows);
    throwOnError(error, "import.items");
  }

  return { resourceId: input.resourceId, imported: rows.length };
}

export async function listFulfilmentResources(filter?: {
  partnerOrgId?: string | null;
}): Promise<
  Array<{
    id: string;
    name: string;
    resourceKind: string;
    status: string;
    partnerOrgId: string | null;
    availableCount: number;
  }>
> {
  const supabase = createSupabaseAdminClient();
  let query = supabase
    .from("fulfilment_resource")
    .select("id, name, resource_kind, status, partner_org_id")
    .order("created_at", { ascending: false });
  if (filter?.partnerOrgId) {
    query = query.eq("partner_org_id", filter.partnerOrgId);
  }
  const { data, error } = await query;
  throwOnError(error, "listResources");

  const resources = data ?? [];
  const result = [];
  for (const resource of resources) {
    const { count } = await supabase
      .from("fulfilment_resource_item")
      .select("id", { count: "exact", head: true })
      .eq("resource_id", resource.id)
      .eq("status", "available");
    result.push({
      id: String(resource.id),
      name: String(resource.name),
      resourceKind: String(resource.resource_kind),
      status: String(resource.status),
      partnerOrgId: (resource.partner_org_id as string | null) ?? null,
      availableCount: count ?? 0,
    });
  }
  return result;
}
