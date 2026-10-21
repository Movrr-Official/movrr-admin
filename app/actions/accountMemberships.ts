"use server";
import { z } from "zod";
import { requireCapability, requireAnyCapability } from "@/lib/admin";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { MEMBERSHIP_ROLES } from "@/features/identity/domain/accountDomains";
import { revalidatePath } from "next/cache";
import { createHash } from "node:crypto";
import { CUSTOMER_APP_URL } from "@/lib/env";
import { synchronizeAccountAuthStatus } from "@/features/identity/application/accountAuthStatus";

export async function getAccountOrganisations() {
  await requireCapability("users.read");
  const { data, error } = await createSupabaseAdminClient().from("organisation")
    .select("id,name,type,status").in("type", ["reward_partner", "advertiser", "government"]).eq("status", "active").order("name");
  if (error) throw new Error(error.message);
  return data as { id: string; name: string; type: string; status: string }[];
}
export async function getAccountMemberships(userId: string) {
  await requireCapability("users.read");
  z.string().uuid().parse(userId);
  const { data, error } = await createSupabaseAdminClient().from("organisation_membership")
    .select("id,organisation_id,role,status,updated_at,organisation:organisation_id(name,type)").eq("user_id", userId);
  if (error) throw new Error(error.message);
  return (data ?? []).map(row => {
    const org = (Array.isArray(row.organisation) ? row.organisation[0] : row.organisation) as { name: string; type: string };
    return { id: row.id as string, organisationId: row.organisation_id as string,
      organisationName: org.name, domain: org.type === "reward_partner" ? "partner" : org.type,
      role: row.role as string, status: row.status as string, updatedAt: row.updated_at as string };
  });
}
const changeSchema = z.object({ userId: z.string().uuid(), organisationId: z.string().uuid(),
  role: z.enum(MEMBERSHIP_ROLES), status: z.enum(["active", "invited", "revoked"]), expectedUpdatedAt: z.string().datetime({ offset: true }).nullable(),
}).strict();
export async function changeAccountMembership(raw: z.infer<typeof changeSchema>) {
  const input = changeSchema.parse(raw);
  const actor = await requireAnyCapability(["users.role.assign", "users.role.approve"], { mutation: true });
  const { data, error } = await createSupabaseAdminClient().rpc("change_organisation_membership", {
    p_actor: actor.authUser.id, p_user: input.userId, p_organisation: input.organisationId,
    p_role: input.role, p_status: input.status, p_expected: input.expectedUpdatedAt,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/users");
  return data;
}

export async function issueAccountInvitation(raw: Omit<z.infer<typeof changeSchema>, "status">, operationToken: string) {
  const input = changeSchema.omit({ status: true }).parse(raw);
  const actor = await requireAnyCapability(["users.role.assign", "users.role.approve"], { mutation: true });
  const token = z.string().regex(/^[a-f0-9]{64}$/).parse(operationToken);
  const { data, error } = await createSupabaseAdminClient().rpc("issue_organisation_invitation", {
    p_actor: actor.authUser.id, p_user: input.userId, p_organisation: input.organisationId,
    p_role: input.role, p_token_hash: createHash("sha256").update(token).digest("hex"), p_expected: input.expectedUpdatedAt,
  });
  if (error) throw new Error(error.message);
  const url = new URL("/auth/accept-organisation-invitation", CUSTOMER_APP_URL); url.searchParams.set("token", token);
  return { invitationId: String(data.id), url: url.toString() };
}
export async function getAccountInvitations(userId: string) {
  await requireCapability("users.read");
  z.string().uuid().parse(userId);
  const client = createSupabaseAdminClient();
  const account = await client.from("user").select("email").eq("id", userId).single();
  if (account.error) throw new Error(account.error.message);
  const { data, error } = await client.from("platform_invitations")
    .select("id,target_entity_id,role,status,expires_at").eq("scope", "organisation").eq("email", String(account.data.email).toLowerCase());
  if (error) throw new Error(error.message);
  return (data ?? []) as { id: string; target_entity_id: string; role: string; status: string; expires_at: string }[];
}
export async function revokeAccountInvitation(invitationId: string) {
  z.string().uuid().parse(invitationId);
  const actor = await requireAnyCapability(["users.role.assign", "users.role.approve"], { mutation: true });
  const { error } = await createSupabaseAdminClient().rpc("revoke_organisation_invitation", { p_actor: actor.authUser.id, p_invitation: invitationId });
  if (error) throw new Error(error.message);
  revalidatePath("/users");
}
export async function retryAccountAuthSynchronization(userId: string) {
  z.string().uuid().parse(userId);
  const actor = await requireCapability("users.manage", { mutation: true });
  await synchronizeAccountAuthStatus(createSupabaseAdminClient(), actor.authUser.id, userId);
}
