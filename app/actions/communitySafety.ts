"use server";

import { z } from "zod";
import { requireCapability } from "@/lib/admin";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { revalidatePath } from "next/cache";

const reasons = z.enum(["harassment", "sexual", "violence", "hate", "spam", "impersonation", "other"]);
const filters = z.object({ status: z.enum(["open", "dismissed", "actioned"]), reason: reasons.optional() }).strict();
const decision = z.object({
  operation: z.string().uuid(), ride: z.string().uuid(), version: z.number().int().positive().nullable(),
  report: z.string().uuid().optional(), reportVersion: z.number().int().positive().optional(),
  action: z.enum(["approve", "restrict", "dismiss", "remove"]), reason: z.string().trim().min(3).max(2000),
}).strict();

export async function getCommunitySafetyQueue(input: z.input<typeof filters>) {
  await requireCapability("community.manage");
  const parsed = filters.parse(input);
  const db = createSupabaseAdminClient();
  let query = db.from("community_report")
    .select("id,ride_id,subject_rider_id,target,reason,description,evidence,created_at,status,version")
    .eq("status", parsed.status).order("created_at").limit(100);
  if (parsed.reason) query = query.eq("reason", parsed.reason);
  const [reports, pending, cases] = await Promise.all([
    query,
    db.from("community_ride").select("id,title,description,organizer_name,organizer_rider_id,meeting_point_name,meeting_point_address,cover_image_path,moderation_version,created_at")
      .eq("moderation_state", "pending").order("created_at").limit(100),
    db.from("community_safety_case").select("id,ride_id,report_id,version,first_review_at,urgency,closed_at,reopened_at,created_at").order("created_at").limit(100),
  ]);
  if (reports.error || pending.error || cases.error) throw new Error("Safety queue unavailable. Please retry.");
  function image(path: unknown, ride: string, report?: string) {
    if (typeof path !== "string" || !path) return null;
    return `/api/v1/community-rides/${encodeURIComponent(ride)}/cover${report ? `?report=${encodeURIComponent(report)}` : ""}`;
  }
  const reportRows = await Promise.all((reports.data ?? []).map(async report => {
    const current = await db.from("community_ride")
      .select("id,title,description,organizer_name,cover_image_path,moderation_version,moderation_state")
      .eq("id", report.ride_id).maybeSingle();
    const audit = await db.from("community_moderation_audit").select("action,reason,created_at")
      .eq("report_id", report.id).order("created_at", { ascending: false }).limit(10);
    if (current.error || audit.error) throw new Error("Report evidence unavailable.");
    return { ...report, image: image(report.evidence?.cover_image_path, report.ride_id, report.id),
      current: current.data, currentImage: image(current.data?.cover_image_path, report.ride_id), audit: audit.data ?? [] };
  }));
  const holds = await db.rpc("community_safety_case_holds", { p_cases: (cases.data ?? []).map(item => item.id) });
  if (holds.error) throw new Error("Case holds unavailable. Please retry.");
  const activeHolds = (holds.data ?? []) as { id: string; caseId: string; reviewDueAt: string }[];
  return { reports: reportRows, pending: (pending.data ?? []).map(ride => ({ ...ride, image: image(ride.cover_image_path, ride.id) })),
    cases: (cases.data ?? []).map(item => ({ ...item, holds: activeHolds.filter(hold => hold.caseId === item.id) })) };
}

const caseCommand = z.object({
  operation: z.string().uuid(), caseId: z.string().uuid(), version: z.number().int().positive(),
  action: z.enum(["triage_urgent", "triage_routine", "close", "reopen", "hold", "release"]),
  reason: z.string().trim().min(3).max(500), hold: z.string().uuid().optional(),
  authority: z.string().trim().min(3).max(500).optional(), review: z.string().datetime({ offset: true }).optional(),
  policy: z.number().int().positive().optional(), retain: z.boolean().default(false),
}).strict();
export async function commandCommunitySafetyCase(input: z.input<typeof caseCommand>) {
  const actor = await requireCapability("community.manage", { mutation: true });
  const parsed = caseCommand.parse(input);
  if (["hold", "release"].includes(parsed.action)) await requireCapability("privacy.deletion.compliance.review", { mutation: true });
  const result = await createSupabaseAdminClient().rpc("command_community_safety_case", {
    p_operation: parsed.operation, p_actor: actor.authUser.id, p_case: parsed.caseId,
    p_version: parsed.version, p_action: parsed.action, p_reason: parsed.reason,
    p_hold: parsed.hold ?? null, p_authority: parsed.authority ?? null, p_review: parsed.review ?? null,
    p_policy: parsed.policy ?? null, p_retain: parsed.retain,
  });
  if (result.error) return { success: false, conflict: result.error.code === "40001", error: "Case could not be saved. Refresh after a conflict; otherwise retry the same operation. Retained evidence requires an approved privacy policy." };
  revalidatePath("/community-rides");
  return { success: true };
}

export async function moderateCommunityContent(input: z.input<typeof decision>) {
  const actor = await requireCapability("community.manage", { mutation: true });
  const parsed = decision.parse(input);
  const { error } = await createSupabaseAdminClient().rpc("moderate_community_content", {
    p_operation: parsed.operation, p_actor: actor.authUser.id, p_ride: parsed.ride,
    p_version: parsed.version, p_action: parsed.action, p_reason: parsed.reason,
    p_report: parsed.report ?? null, p_report_version: parsed.reportVersion ?? null,
  });
  if (error) return { success: false, conflict: error.code === "40001", error: error.code === "40001"
    ? "This content or report changed. Refresh and review it again."
    : "Decision could not be saved. Retry the same decision." };
  revalidatePath("/community-rides");
  return { success: true };
}
