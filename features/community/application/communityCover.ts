import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fail, ok } from "@/lib/result/ApplicationResult";

export const coverHeaders = {
  "cache-control": "private, no-store, max-age=0",
  "cdn-cache-control": "no-store",
  "vercel-cdn-cache-control": "no-store",
  "x-content-type-options": "nosniff",
  "vary": "Authorization, Cookie",
  "cross-origin-resource-policy": "same-origin",
};
export function coverResponse(bytes: Blob) {
  return new Response(bytes, { headers: { ...coverHeaders, "content-type": bytes.type } });
}
/** The caller-scoped SELECT is the visibility authority. Storage credentials
 * only transport the derived immutable bytes; they never authorise the caller. */
export async function readCommunityCover(
  scoped: SupabaseClient, storage: SupabaseClient, ride: string,
  options: { userId?: string; staged?: string; report?: string; staff?: boolean } = {},
) {
  const select = () => scoped.from("community_ride")
    .select("id,organizer_user_id,cover_image_path,updated_at").eq("id", ride).maybeSingle();
  const before = await select();
  let path: string | null = before.data?.cover_image_path ?? null;
  let evidenceSnapshot: string | undefined;
  if (options.report) {
    if (!options.staff) return fail("permission_denied", "Cover unavailable");
    const evidence = await scoped.from("community_report").select("evidence,version")
      .eq("id", options.report).eq("ride_id", ride).maybeSingle();
    if (evidence.error) return fail("unavailable", "Cover unavailable");
    path = evidence.data?.evidence?.cover_image_path ?? null;
    evidenceSnapshot = JSON.stringify(evidence.data);
  } else if (options.staged) {
    if (!before.data || before.data.organizer_user_id !== options.userId ||
        !options.staged.startsWith(`${options.userId}/${ride}/`)) return fail("permission_denied", "Cover unavailable");
    path = options.staged;
  } else if (before.error || !before.data) return fail("not_found", "Cover unavailable");
  if (!path) return fail("not_found", "Cover unavailable");
  const bytes = await storage.storage.from("community-rides").download(path);
  if (bytes.error || !bytes.data || bytes.data.size > 5 * 1024 * 1024 ||
      !["image/jpeg", "image/png", "image/webp"].includes(bytes.data.type)) return fail("not_found", "Cover unavailable");
  // Drop a response whose visibility, owner or revision changed during transport.
  if (options.report) {
    const after = await scoped.from("community_report").select("evidence,version").eq("id", options.report).eq("ride_id", ride).maybeSingle();
    if (after.error || JSON.stringify(after.data) !== evidenceSnapshot) return fail("permission_denied", "Cover unavailable");
  } else {
    const after = await select();
    if (after.error || !after.data || JSON.stringify(after.data) !== JSON.stringify(before.data)) return fail("permission_denied", "Cover unavailable");
  }
  return ok(bytes.data);
}
