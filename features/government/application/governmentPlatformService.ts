import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { fail, ok, type ApplicationResult } from "@/lib/result/ApplicationResult";
import type { RequestContext } from "@/features/identity/domain/Principal";

function requireGovernmentOrg(ctx: RequestContext): ApplicationResult<{
  organisationId: string;
}> {
  if (ctx.principal.type === "admin") {
    return ok({ organisationId: "" });
  }
  if (
    ctx.principal.type !== "organisation" ||
    ctx.principal.organisationType !== "government"
  ) {
    return fail("permission_denied", "Government organisation required");
  }
  return ok({ organisationId: ctx.principal.organisationId });
}

export async function getGovernmentProfile(
  ctx: RequestContext,
): Promise<ApplicationResult<unknown>> {
  const org = requireGovernmentOrg(ctx);
  if (!org.ok) return org;

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("organisation")
    .select("*")
    .eq("id", org.value.organisationId)
    .maybeSingle();

  if (error) return fail("BusinessFailure", error.message);
  if (!data) return fail("not_found", "Organisation not found");

  return ok({
    organisationId: data.id,
    name: data.name,
    type: data.type,
    status: data.status,
    role: ctx.principal.type === "organisation" ? ctx.principal.role : null,
  });
}

export async function getGovernmentProgrammes(
  ctx: RequestContext,
): Promise<ApplicationResult<unknown>> {
  const orgCheck = requireGovernmentOrg(ctx);
  if (!orgCheck.ok && ctx.principal.type !== "admin") return orgCheck;

  const supabase = createSupabaseAdminClient();
  const [{ data: campaigns, error: campaignError }, { data: rides, error: rideError }] =
    await Promise.all([
      supabase
        .from("campaign")
        .select("id, name, lifecycle_status, budget, impressions, start_date, end_date")
        .in("lifecycle_status", ["active", "confirmed", "completed"])
        .limit(50),
      supabase
        .from("ride_session")
        .select("id, status, verification_status, created_at")
        .order("created_at", { ascending: false })
        .limit(100),
    ]);

  if (campaignError) return fail("BusinessFailure", campaignError.message);
  if (rideError) return fail("BusinessFailure", rideError.message);

  const verified = (rides ?? []).filter((r) => r.verification_status === "verified").length;
  const pending = (rides ?? []).filter((r) => r.verification_status === "pending").length;

  return ok({
    kpis: {
      activeCampaigns: (campaigns ?? []).filter((c) => c.lifecycle_status === "active").length,
      totalImpressions: (campaigns ?? []).reduce(
        (sum, c) => sum + Number(c.impressions ?? 0),
        0,
      ),
      verifiedRides: verified,
      pendingVerification: pending,
    },
    campaigns: campaigns ?? [],
    complianceSummary: {
      verifiedRides: verified,
      pendingReview: pending,
      rejectedRides: (rides ?? []).filter((r) => r.verification_status === "rejected").length,
    },
  });
}
