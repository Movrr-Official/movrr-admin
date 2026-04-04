/**
 * Admin-only diagnostics API for LLM route intelligence shadow logs.
 *
 * READ-ONLY. Returns recent shadow execution records from route_intelligence_logs
 * for internal evaluation. Requires admin auth AND llmShadowModeEnabled flag.
 *
 * All responses carry a disclaimer header confirming these are experimental
 * outputs that have never influenced live routing or user-facing behavior.
 *
 * SHADOW MODE ONLY. Must not be used to drive production decisions.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { ADMIN_ONLY_ROLES } from "@/lib/authPermissions";
import { requireAdminRoles } from "@/lib/admin";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { getResolvedPlatformSettingsValues } from "@/lib/platformSettings";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const EXPERIMENTAL_DISCLAIMER =
  "LLM shadow outputs are EXPERIMENTAL. They have not influenced any live routing, " +
  "reward, or user-facing decision. Do not use for operational purposes.";

const querySchema = z.object({
  capability: z
    .enum(["route_suggestion", "route_explanation", "policy_translation"])
    .optional(),
  validation_status: z
    .enum(["success", "validation_failed", "llm_error", "disabled", "skipped"])
    .optional(),
  trace_id: z.string().trim().max(128).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export async function GET(request: Request) {
  // Require admin-only role (not moderator)
  try {
    await requireAdminRoles(ADMIN_ONLY_ROLES);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Require llmShadowModeEnabled flag — prevents confusing operators if they
  // find this endpoint before shadow mode is intentionally turned on
  try {
    const values = await getResolvedPlatformSettingsValues();
    const shadowEnabled = values.features.llmShadowModeEnabled ?? false;
    const globalDisable = values.features.llmGlobalDisable ?? true;

    if (globalDisable || !shadowEnabled) {
      return NextResponse.json(
        {
          error: "LLM shadow mode is not enabled",
          disclaimer: EXPERIMENTAL_DISCLAIMER,
        },
        { status: 403, headers: { "cache-control": "no-store" } },
      );
    }
  } catch {
    return NextResponse.json(
      { error: "Failed to load platform settings" },
      { status: 500, headers: { "cache-control": "no-store" } },
    );
  }

  const url = new URL(request.url);
  const queryResult = querySchema.safeParse(
    Object.fromEntries(url.searchParams),
  );
  if (!queryResult.success) {
    return NextResponse.json(
      { error: "Invalid query parameters", issues: queryResult.error.issues },
      { status: 400 },
    );
  }

  const { capability, validation_status, trace_id, limit, offset } =
    queryResult.data;

  const supabase = createSupabaseAdminClient();

  let query = supabase
    .from("route_intelligence_logs")
    .select(
      "id, trace_id, capability, input_summary, deterministic_output_summary, " +
        "llm_output, validation_status, latency_ms, model_name, error_message, created_at",
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (capability) query = query.eq("capability", capability);
  if (validation_status) query = query.eq("validation_status", validation_status);
  if (trace_id) query = query.eq("trace_id", trace_id);

  const { data, error, count } = await query;

  if (error) {
    if (error.code === "42P01") {
      // Table not yet created — migration not run
      return NextResponse.json(
        {
          logs: [],
          total: 0,
          limit,
          offset,
          disclaimer: EXPERIMENTAL_DISCLAIMER,
          notice: "route_intelligence_logs table does not exist yet. Run migration 025.",
        },
        { headers: { "cache-control": "no-store" } },
      );
    }
    console.error("[route-intelligence] GET diagnostics failed", error);
    return NextResponse.json(
      { error: "Failed to fetch intelligence logs" },
      { status: 500, headers: { "cache-control": "no-store" } },
    );
  }

  return NextResponse.json(
    {
      logs: data ?? [],
      total: count ?? 0,
      limit,
      offset,
      disclaimer: EXPERIMENTAL_DISCLAIMER,
    },
    { headers: { "cache-control": "no-store" } },
  );
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: { Allow: "GET, OPTIONS" },
  });
}
