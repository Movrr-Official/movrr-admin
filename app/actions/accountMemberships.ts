"use server";
import { z } from "zod";
import { unstable_rethrow } from "next/navigation";
import { requireCapability, requireAnyCapability } from "@/lib/admin";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { MEMBERSHIP_ROLES } from "@/features/identity/domain/accountDomains";
import type { AccountMembership, MembershipResult } from "@/features/identity/domain/membershipManagement";
import { readAllRows } from "@/lib/supabase/readAllRows";
import { revalidatePath } from "next/cache";
import { createHash } from "node:crypto";
import { CUSTOMER_APP_URL } from "@/lib/env";
import { synchronizeAccountAuthStatus } from "@/features/identity/application/accountAuthStatus";

// Expected denials are serializable values, never production-redacted throws.
// Framework redirects still propagate. Unexpected failures remain server-visible.
async function request<T>(operation: string, work: () => Promise<MembershipResult<T>>): Promise<MembershipResult<T>> {
  try { return await work(); }
  catch (error) {
    unstable_rethrow(error);
    if (error instanceof z.ZodError) return { success: false, error: { code: "invalid", message: "Check the user, organisation, role and membership version." } };
    const code = (error as { code?: string })?.code;
    if (["UNAUTHENTICATED", "NOT_ADMIN", "INVALID_ADMIN_ROLE", "NOT_AUTHORIZED", "MFA_REQUIRED", "SESSION_EXPIRED", "SESSION_BOOTSTRAP_REQUIRED"].includes(code ?? "")) {
      return { success: false, error: { code: "denied", message: error instanceof Error ? error.message : "Your session cannot manage this access. Sign in again." } };
    }
    console.error("Account membership request failed", { operation, error });
    return { success: false, error: { code: "unavailable", message: `Unable to ${operation}. Reload and try again.` } };
  }
}
function commandFailure(error: { code?: string; message: string }): Extract<MembershipResult<never>, { success: false }> {
  if (error.message === "Cannot remove last active organisation owner") return { success: false, error: { code: "last_owner", message: error.message + ". Assign another active Owner first." } };
  if (error.code === "40001") return { success: false, error: { code: "conflict", message: "This membership changed. Reload before changing access." } };
  if (error.code === "42501") return { success: false, error: { code: "denied", message: "Your current access does not authorize this membership action." } };
  const expected = ["Active external organisation required", "Active target account required", "Invalid membership contract", "Role is invalid for the organisation domain", "Membership not found", "A pending invitation already exists; revoke it before replacing access", "Invitation is no longer pending; manage the current membership explicitly", "Invitation not found", "Invitation was superseded"];
  if (expected.includes(error.message)) return { success: false, error: { code: "invalid", message: error.message } };
  console.error("Canonical membership command failed", error);
  return { success: false, error: { code: "unavailable", message: "The membership result could not be confirmed. Reload before retrying." } };
}
function invalidateUsers() {
  try { revalidatePath("/users"); }
  catch (error) {
    unstable_rethrow(error);
    console.error("Membership committed but Users invalidation failed", error);
    return "Access was saved, but the Users view could not be refreshed. Reload the page.";
  }
}
export async function getAccountOrganisations() {
  return request("load organisations", async () => {
    await requireCapability("users.read");
    const rows = await readAllRows((from, to) => createSupabaseAdminClient().from("organisation")
      .select("id,name,type,status").in("type", ["reward_partner", "advertiser", "government"]).eq("status", "active").order("name").order("id").range(from, to));
    return { success: true, data: rows as { id: string; name: string; type: string; status: string }[] };
  });
}
export async function getAccountMemberships(userId: string): Promise<MembershipResult<AccountMembership[]>> {
  return request("load organisation memberships", async () => {
    await requireCapability("users.read"); z.string().uuid().parse(userId);
    const client = createSupabaseAdminClient();
    const rows = await readAllRows((from, to) => client.from("organisation_membership")
      .select("id,organisation_id,role,status,updated_at,organisation:organisation_id(name,type)").eq("user_id", userId).order("id").range(from, to));
    const ownerOrgs = rows.filter(row => row.role === "owner" && row.status === "active").map(row => row.organisation_id);
    const otherActiveOwners = new Set<string>();
    if (ownerOrgs.length) {
      const owners = await readAllRows((from, to) => client.from("organisation_membership").select("id,user_id,organisation_id")
        .in("organisation_id", ownerOrgs).eq("role", "owner").eq("status", "active").order("id").range(from, to));
      const active = new Map<string, boolean>();
      for (const owner of owners) {
        if (!active.has(owner.user_id)) {
          const result = await client.rpc("account_identity_active", { p_user: owner.user_id });
          if (result.error) throw new Error(result.error.message);
          active.set(owner.user_id, result.data === true);
        }
        if (owner.user_id !== userId && active.get(owner.user_id)) otherActiveOwners.add(owner.organisation_id);
      }
    }
    return { success: true, data: rows.map(row => {
      const org = (Array.isArray(row.organisation) ? row.organisation[0] : row.organisation) as { name: string; type: string } | null;
      if (!org || !["reward_partner", "advertiser", "government"].includes(org.type)) throw new Error("Membership organisation projection is invalid");
      return { id: row.id, organisationId: row.organisation_id, organisationName: org.name,
        domain: org.type === "reward_partner" ? "partner" : org.type, role: row.role, status: row.status, updatedAt: row.updated_at,
        isLastActiveOwner: row.role === "owner" && row.status === "active" && !otherActiveOwners.has(row.organisation_id) } as AccountMembership;
    }) };
  });
}
const changeSchema = z.object({ userId: z.string().uuid(), organisationId: z.string().uuid(), role: z.enum(MEMBERSHIP_ROLES),
  status: z.enum(["active", "invited", "revoked"]), expectedUpdatedAt: z.string().datetime({ offset: true }).nullable() }).strict();
const membershipReceipt = z.object({ id: z.string().uuid(), user_id: z.string().uuid(), organisation_id: z.string().uuid(),
  role: z.enum(MEMBERSHIP_ROLES), status: z.enum(["active", "invited", "revoked"]), updated_at: z.string().datetime({ offset: true }) }).passthrough();
export async function changeAccountMembership(raw: z.infer<typeof changeSchema>) {
  return request("update organisation membership", async () => {
    const input = changeSchema.parse(raw);
    const actor = await requireAnyCapability(["users.role.assign", "users.role.approve"], { mutation: true });
    const { data, error } = await createSupabaseAdminClient().rpc("change_organisation_membership", {
      p_actor: actor.authUser.id, p_user: input.userId, p_organisation: input.organisationId,
      p_role: input.role, p_status: input.status, p_expected: input.expectedUpdatedAt });
    if (error) return commandFailure(error);
    const confirmed = membershipReceipt.safeParse(data);
    if (!confirmed.success || confirmed.data.user_id !== input.userId || confirmed.data.organisation_id !== input.organisationId || confirmed.data.role !== input.role || confirmed.data.status !== input.status) {
      return commandFailure({ message: "Canonical membership response did not confirm the requested assignment" });
    }
    return { success: true, data: confirmed.data, warning: invalidateUsers() };
  });
}
export async function issueAccountInvitation(raw: Omit<z.infer<typeof changeSchema>, "status">, operationToken: string) {
  return request("create organisation invitation", async () => {
    const input = changeSchema.omit({ status: true }).parse(raw);
    const actor = await requireAnyCapability(["users.role.assign", "users.role.approve"], { mutation: true });
    const token = z.string().regex(/^[a-f0-9]{64}$/).parse(operationToken);
    const url = new URL("/auth/accept-organisation-invitation", CUSTOMER_APP_URL); url.searchParams.set("token", token);
    const { data, error } = await createSupabaseAdminClient().rpc("issue_organisation_invitation", {
      p_actor: actor.authUser.id, p_user: input.userId, p_organisation: input.organisationId,
      p_role: input.role, p_token_hash: createHash("sha256").update(token).digest("hex"), p_expected: input.expectedUpdatedAt });
    if (error) return commandFailure(error);
    return { success: true, data: { invitationId: String(data.id), url: url.toString() }, warning: invalidateUsers() };
  });
}
export async function getAccountInvitations(userId: string) {
  return request("load organisation invitations", async () => {
    await requireCapability("users.read"); z.string().uuid().parse(userId);
    const client = createSupabaseAdminClient(), account = await client.from("user").select("email").eq("id", userId).single();
    if (account.error) throw new Error(account.error.message);
    const rows = await readAllRows((from, to) => client.from("platform_invitations").select("id,target_entity_id,role,status,expires_at")
      .eq("scope", "organisation").eq("email", String(account.data.email).toLowerCase()).order("id").range(from, to));
    return { success: true, data: rows as { id: string; target_entity_id: string; role: string; status: string; expires_at: string }[] };
  });
}
export async function revokeAccountInvitation(invitationId: string) {
  return request("revoke organisation invitation", async () => {
    z.string().uuid().parse(invitationId);
    const actor = await requireAnyCapability(["users.role.assign", "users.role.approve"], { mutation: true });
    const { error } = await createSupabaseAdminClient().rpc("revoke_organisation_invitation", { p_actor: actor.authUser.id, p_invitation: invitationId });
    if (error) return commandFailure(error);
    return { success: true, data: null, warning: invalidateUsers() };
  });
}
export async function retryAccountAuthSynchronization(userId: string) {
  // Separate status recovery contract; never a membership writer.
  z.string().uuid().parse(userId);
  const actor = await requireCapability("users.manage", { mutation: true });
  await synchronizeAccountAuthStatus(createSupabaseAdminClient(), actor.authUser.id, userId);
}
