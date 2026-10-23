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
  const [reports, pending] = await Promise.all([
    query,
    db.from("community_ride").select("id,title,description,organizer_name,organizer_rider_id,meeting_point_name,meeting_point_address,cover_image_path,moderation_version,created_at")
      .eq("moderation_state", "pending").order("created_at").limit(100),
  ]);
  if (reports.error || pending.error) throw new Error("Safety queue unavailable. Please retry.");
  async function image(path: unknown) {
    if (typeof path !== "string" || !path) return null;
    const { data, error } = await db.storage.from("community-rides").createSignedUrl(path, 300);
    if (error) throw new Error("Evidence image unavailable. Do not approve until it can be reviewed.");
    return data.signedUrl;
  }
  const reportRows = await Promise.all((reports.data ?? []).map(async report => {
    const current = await db.from("community_ride")
      .select("id,title,description,organizer_name,cover_image_path,moderation_version,moderation_state")
      .eq("id", report.ride_id).maybeSingle();
    const audit = await db.from("community_moderation_audit").select("action,reason,created_at")
      .eq("report_id", report.id).order("created_at", { ascending: false }).limit(10);
    if (current.error || audit.error) throw new Error("Report evidence unavailable.");
    return { ...report, image: await image(report.evidence?.cover_image_path),
      current: current.data, currentImage: await image(current.data?.cover_image_path), audit: audit.data ?? [] };
  }));
  return { reports: reportRows, pending: await Promise.all((pending.data ?? []).map(async ride => ({ ...ride, image: await image(ride.cover_image_path) }))) };
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
