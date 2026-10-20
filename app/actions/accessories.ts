"use server";
import { z } from "zod";
import { requireCapability } from "@/lib/admin";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { revalidatePath } from "next/cache";
export async function getAccessoryAssignments(riderId?: string, cursor?: string) {
  await requireCapability("riders.read");
  if (riderId) z.string().uuid().parse(riderId);
  if (cursor) z.string().uuid().parse(cursor);
  const { data, error } = await (
    await createSupabaseServerClient()
  ).rpc("ops_accessory_page", { p_rider: riderId ?? null, p_cursor: cursor ?? null });
  if (error) throw new Error("Equipment operations unavailable");
  return data as {
    assignments: Array<{
      id: string;
      rider_id: string;
      campaign_id: string;
      status: string;
      asset_code: string;
      updated_at: string;
      events: Array<{
        id: string;
        event_type: string;
        note: string | null;
        created_at: string;
      }>;
    }>;
    nextCursor: string | null;
  };
}
export async function accessoryCommand(_previous: unknown, form: FormData) {
  try {
    await requireCapability("riders.manage", { mutation: true });
    const p = z
      .object({
        assignment: z.string().uuid(),
        action: z.enum(["return", "cancel", "replace", "return_due"]),
        expected: z.string().min(1),
        operation: z.string().uuid(),
        reason: z.string().trim().min(10).max(2000),
        replacement: z.union([z.string().uuid(), z.literal("")]),
      })
      .parse(Object.fromEntries(form));
    const { error } = await (
      await createSupabaseServerClient()
    ).rpc("ops_accessory_command", {
      p_assignment: p.assignment,
      p_action: p.action,
      p_expected: p.expected,
      p_operation: p.operation,
      p_reason: p.reason,
      p_replacement: p.replacement || null,
    });
    if (error)
      throw new Error(
        error.code === "40001"
          ? "Equipment changed. Refresh before continuing."
          : "Command unavailable. Retry the same operation.",
      );
    revalidatePath("/riders/accessories");
    return { success: true, error: null };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Equipment command unavailable",
    };
  }
}

export async function getAvailableEquipment(cursor?: string) {
  await requireCapability("riders.read");
  if (cursor) z.string().uuid().parse(cursor);
  const { data, error } = await (
    await createSupabaseServerClient()
  ).rpc("ops_inventory_page", { p_cursor: cursor ?? null });
  if (error) throw new Error("Inventory unavailable");
  return data as {
    items: Array<{ id: string; asset_code: string; status: string; updated_at: string }>;
    nextCursor: string | null;
  };
}
export async function inventoryCommand(_previous: unknown, form: FormData) {
  try {
    await requireCapability("riders.manage", { mutation: true });
    const p = z
      .object({
        inventory: z.string().uuid(),
        expected: z.string().min(1),
        operation: z.string().uuid(),
        reason: z.string().trim().min(10).max(2000),
        action: z.enum(["assign", "available", "retired"]),
        rider: z.string().optional(),
        campaign: z.string().optional(),
      })
      .parse(Object.fromEntries(form));
    const args =
      p.action === "assign"
        ? {
            p_inventory: p.inventory,
            p_rider: z.string().uuid().parse(p.rider),
            p_campaign: z.string().uuid().parse(p.campaign),
            p_expected: p.expected,
            p_operation: p.operation,
            p_reason: p.reason,
          }
        : {
            p_inventory: p.inventory,
            p_status: p.action,
            p_expected: p.expected,
            p_operation: p.operation,
            p_reason: p.reason,
          };
    const { error } = await (
      await createSupabaseServerClient()
    ).rpc(
      p.action === "assign" ? "ops_assign_accessory" : "ops_inventory_disposition",
      args,
    );
    if (error)
      throw new Error(
        error.code === "40001"
          ? "Inventory changed. Refresh before continuing."
          : "Inventory action unavailable. Retry the same operation.",
      );
    revalidatePath("/riders/accessories");
    return { success: true, error: null };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "Inventory command unavailable",
    };
  }
}
