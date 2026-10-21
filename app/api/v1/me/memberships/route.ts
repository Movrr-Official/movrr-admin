import { NextResponse } from "next/server";
import { verifySupabaseAccessToken } from "@/features/identity/infrastructure/supabaseJwtVerifier";
import { extractBearerToken } from "@/lib/http/platformRoute";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { capabilitiesForMembership } from "@/features/organisations/domain/CapabilityCatalog";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const identity = await verifySupabaseAccessToken(extractBearerToken(request) ?? "");
  const headers = { "cache-control": "no-store" };
  if (!identity) return NextResponse.json({ kind: "unauthenticated", message: "Active account required" }, { status: 401, headers });
  const client = createSupabaseAdminClient();
  const [members, rider] = await Promise.all([
    client.from("organisation_membership").select("id,organisation_id,role,organisation:organisation_id!inner(name,type,status)")
      .eq("user_id", identity.userId).eq("status", "active").eq("organisation.status", "active"),
    client.from("rider").select("id").eq("user_id", identity.userId).eq("status", "active").maybeSingle(),
  ]);
  if (members.error || rider.error) return NextResponse.json({ kind: "infra", message: "Membership discovery unavailable" }, { status: 503, headers });
  const memberships = (members.data ?? []).flatMap(row => {
    const org = (Array.isArray(row.organisation) ? row.organisation[0] : row.organisation) as { name: string; type: string };
    const capabilities = capabilitiesForMembership(org.type, row.role);
    return capabilities.length ? [{ id: row.id, organisationId: row.organisation_id, name: org.name,
      domain: org.type === "reward_partner" ? "partner" : org.type, role: row.role, capabilities }] : [];
  });
  return NextResponse.json({ data: { memberships, rider: Boolean(rider.data) } }, { headers });
}
