"use server";
import { z } from "zod";
import { requireCapability } from "@/lib/admin";
import { createSupabaseServerClient } from "@/lib/supabase-server";

const status = z.object({ state: z.enum(["enabled", "disabled", "hold"]), version: z.number().int().nonnegative(), changedAt: z.string(), changedBy: z.string().nullable(), reason: z.string(), requestsEnabled: z.boolean(), policyVersion: z.number().int().positive() });
const command = z.object({ accountId: z.string().uuid(), state: z.enum(["enabled", "disabled", "hold"]), expectedVersion: z.number().int().nonnegative(), reason: z.string().trim().min(10).max(1000), operation: z.string().uuid() }).strict();
export type DeletionIntakeStatus = z.infer<typeof status>;
export async function getDeletionIntakeControl() {
  try {
    await requireCapability("privacy.deletion.monitor");
    const { data, error } = await (await createSupabaseServerClient()).rpc("account_deletion_intake_status");
    if (error) throw error;
    return { data: status.parse(data) };
  } catch { return { error: "Deletion intake control unavailable. Existing request review and receipts remain separate." }; }
}
export async function changeDeletionIntake(input: z.infer<typeof command>) {
  try {
    const actor = await requireCapability("settings.security", { mutation: true });
    const p = command.parse(input);
    if (p.accountId !== actor.authUser.id) return { error: "Account changed. Refresh intake state before submitting." };
    const { data, error } = await (await createSupabaseServerClient()).rpc("set_account_deletion_intake", { p_state: p.state, p_expected: p.expectedVersion, p_reason: p.reason, p_operation: p.operation });
    if (error) return { error: error.code === "40001" ? "Another administrator changed intake. Refresh and review before submitting again." : error.code === "55000" ? "The intake contract and approved receipt access are required. Intake was not enabled." : "Change not confirmed. Refresh or retry the same operation." };
    return { data: status.parse(data) };
  } catch { return { error: "A security administrator, current version and reason are required." }; }
}
