import "server-only";
import { z } from "zod";
import { platformRoute } from "@/lib/http/platformRoute";
import { productionAuthDeps } from "@/features/platform/infrastructure/productionPlatformApi";
import { createSupabaseRequestClient } from "@/lib/supabase-request";
import { fail, ok } from "@/lib/result/ApplicationResult";

async function readAllRows(
  query: (
    from: number,
    to: number,
  ) => PromiseLike<{
    data: unknown[] | null;
    error: { message: string; code?: string } | null;
  }>,
) {
  const rows: unknown[] = [];
  for (let from = 0; ; from += 500) {
    const page = await query(from, from + 499);
    if (page.error) return { data: null, error: page.error };
    rows.push(...(page.data ?? []));
    if ((page.data?.length ?? 0) < 500) return { data: rows, error: null };
  }
}
export const riderFeatures = [
  "rides",
  "achievements",
  "accessories",
  "brands",
  "impact",
] as const;
export async function riderSelfService(request: Request, feature: string) {
  return platformRoute({
    request,
    capability: "rewards.catalog.read",
    authDeps: productionAuthDeps,
    handle: async (ctx) => {
      if (ctx.principal.type !== "rider")
        return fail("permission_denied", "Rider required");
      if (!riderFeatures.includes(feature as (typeof riderFeatures)[number]))
        return fail("not_found", "Feature unavailable");
      const riderId = ctx.principal.riderId;
      const db = createSupabaseRequestClient(request);
      const url = new URL(request.url);
      let result: { data: unknown; error: { message: string; code?: string } | null };
      if (request.method === "GET") {
        if (feature === "rides") {
          const id = url.searchParams.get("id");
          if (id && !z.string().uuid().safeParse(id).success)
            return fail("validation", "Invalid ride");
          if (
            url.searchParams.get("routeId") &&
            !z.string().uuid().safeParse(url.searchParams.get("routeId")).success
          )
            return fail("validation", "Invalid route");
          let cursor: unknown = null;
          try {
            if (url.searchParams.get("cursor"))
              cursor = z
                .object({
                  at: z.string().datetime({ offset: true }),
                  id: z.string().uuid(),
                })
                .parse(
                  JSON.parse(
                    Buffer.from(url.searchParams.get("cursor")!, "base64url").toString(
                      "utf8",
                    ),
                  ),
                );
          } catch {
            return fail("validation", "Invalid ride cursor");
          }
          result = id
            ? await db.rpc("get_my_ride_summary", {
                p_session_id: id,
                p_include_trace: false,
              })
            : await db.rpc("get_my_ride_summary_page", {
                p_limit: 50,
                p_cursor: cursor,
                p_route: url.searchParams.get("routeId"),
              });
        } else if (feature === "accessories")
          result = await readAllRows((from, to) =>
            db
              .from("rider_campaign_accessory_overview")
              .select("*")
              .order("assigned_at", { ascending: false })
              .order("id")
              .range(from, to),
          );
        else if (feature === "brands")
          result = await readAllRows((from, to) =>
            db
              .from("rider_brand_catalog")
              .select("*")
              .order("display_name")
              .order("id")
              .range(from, to),
          );
        else if (feature === "impact")
          result = await db.rpc("get_lifetime_impact_summary");
        else {
          result = await readAllRows((from, to) =>
            db
              .from("rider_badge_award")
              .select(
                "id,awarded_at,revoked_at,badge:rider_badge_definition!inner(id,code,short_label,description)",
              )
              .eq("rider_id", riderId)
              .is("revoked_at", null)
              .order("awarded_at", { ascending: false })
              .order("id")
              .range(from, to),
          );
        }
      } else {
        const body = await request.json().catch(() => null);
        if (feature === "brands") {
          const input = z
            .object({
              brandId: z.string().uuid(),
              preference: z.enum(["preferred", "neutral", "avoided"]),
            })
            .strict()
            .safeParse(body);
          if (!input.success) return fail("validation", "Invalid brand preference");
          result = await db.rpc("set_rider_brand_preference", {
            p_brand_id: input.data.brandId,
            p_preference: input.data.preference,
            p_source: "account_brand_preferences",
          });
        } else if (feature === "accessories") {
          const input = z
            .object({
              assignmentId: z.string().uuid(),
              action: z.enum([
                "installed",
                "issue_reported",
                "damaged",
                "missing",
                "lost",
              ]),
              note: z.string().max(2000).optional(),
            })
            .strict()
            .safeParse(body);
          if (!input.success) return fail("validation", "Invalid equipment command");
          result =
            input.data.action === "installed"
              ? await db.rpc("confirm_campaign_accessory_installed", {
                  p_assignment_id: input.data.assignmentId,
                })
              : await db.rpc("report_campaign_accessory_issue", {
                  p_assignment_id: input.data.assignmentId,
                  p_issue_type: input.data.action,
                  p_note: input.data.note ?? null,
                });
        } else if (feature === "achievements")
          result = await db.rpc("sync_my_achievement_progress");
        else return fail("permission_denied", "Read only");
      }
      if (result.error)
        return fail(
          result.error.code === "42501"
            ? "permission_denied"
            : result.error.code === "40001"
              ? "ConcurrencyConflict"
              : "InfrastructureFailure",
          "Rider data unavailable. Refresh and retry.",
        );
      return ok(result.data);
    },
  });
}
