"use server";

import { z } from "zod";
import { requireCapability, requireAnyCapability } from "@/lib/admin";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

export type ShopOperatingStatus = {
  state: "enabled" | "disabled" | "hold";
  version: number;
  changed_at: string;
  changed_by: string | null;
  reason: string;
  canManage: boolean;
  evidence: { criterion: string; passed: boolean; reference: string; revision: string; valid_until: string; version: number }[];
};
export type ShopReadiness = {
  ready: boolean; missingEvidence: string[]; inventoryReady: boolean;
  financial: Record<string, unknown>; scheduler: Record<string, unknown>; worker: Record<string, unknown> | null;
};
const stateCommand = z.object({ state: z.enum(["enabled", "disabled", "hold"]), expectedVersion: z.number().int().nonnegative(), reason: z.string().trim().min(1).max(1000), operation: z.string().uuid() }).strict();
const evidenceCommand = z.object({ criterion: z.string().regex(/^(f([1-9]|1[0-3])|digital|qr|supply|integration|device|provider|web)$/), passed: z.boolean(), reference: z.string().trim().min(10).max(2000), revision: z.string().regex(/^[a-f0-9]{40}$/), validUntil: z.string().datetime(), expectedVersion: z.number().int().nonnegative(), operation: z.string().uuid() }).strict();

export async function getShopOperatingControl(): Promise<{ data?: { status: ShopOperatingStatus; readiness: ShopReadiness | null }; error?: string }> {
  try {
    const auth = await requireAnyCapability(["rewards.catalog.read", "settings.security"]);
    const db = createSupabaseAdminClient();
    const { data, error } = await db.rpc("shop_operating_status", { p_actor: auth.authUser.id });
    if (error) return { error: "Operating control unavailable. Verify backend migration and refresh." };
    let readiness: ShopReadiness | null = null;
    if (data.canManage) {
      const checked = await db.rpc("shop_readiness", { p_actor: auth.authUser.id });
      if (checked.error) return { error: "Readiness checks unavailable. Redemption cannot be enabled." };
      readiness = checked.data;
    }
    return { data: { status: data, readiness } };
  } catch { return { error: "Unable to read Shop operating control with this session." }; }
}

export async function changeShopOperatingState(input: z.infer<typeof stateCommand>) {
  try {
    const auth = await requireCapability("settings.security", { mutation: true });
    const parsed = stateCommand.parse(input);
    const { data, error } = await createSupabaseAdminClient().rpc("shop_set_operating_state", { p_actor: auth.authUser.id, p_state: parsed.state, p_expected: parsed.expectedVersion, p_reason: parsed.reason, p_operation: parsed.operation });
    if (error) return { error: error.code === "40001" ? "Another administrator changed the state. Refresh and review." : error.code === "55000" ? "Launch checks failed or an operational hold must be resolved. Refresh readiness." : "Operating change rejected. Check permissions and retry the same operation." };
    return { data: data as ShopOperatingStatus };
  } catch { return { error: "A security administrator, current version and reason are required." }; }
}

export async function recordShopReadiness(input: z.infer<typeof evidenceCommand>) {
  try {
    const auth = await requireCapability("settings.security", { mutation: true });
    const p = evidenceCommand.parse(input);
    const { error } = await createSupabaseAdminClient().rpc("shop_record_readiness", { p_actor: auth.authUser.id, p_criterion: p.criterion, p_passed: p.passed, p_reference: p.reference, p_revision: p.revision, p_valid_until: p.validUntil, p_expected: p.expectedVersion, p_operation: p.operation });
    if (error) return { error: error.code === "40001" ? "Evidence changed. Refresh before reviewing again." : "Evidence was not recorded. Verify permissions, revision and validity (maximum 30 days)." };
    return { success: true };
  } catch { return { error: "Verified evidence reference, full source revision, validity and security administrator are required." }; }
}
