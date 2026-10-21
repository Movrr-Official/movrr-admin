import { randomBytes } from "node:crypto";
import { z } from "zod";
import { CANONICAL_EMPLOYEE_ROLES } from "@/features/organisations/domain/employeeRoleTemplates";
import type { SupabaseClient } from "@supabase/supabase-js";

// Organisation membership roles are a separate contract. A company display name
// does not confer tenancy, ownership, or an organisation permission bundle.
export const employeeProvisioningSchema = z.object({
  email: z.string().trim().email().transform((v) => v.toLowerCase()),
  name: z.string().trim().min(1).max(100),
  role: z.enum(CANONICAL_EMPLOYEE_ROLES),
  status: z.enum(["active", "inactive", "pending"]),
  organization: z.string().optional(),
  phone: z.string().optional(),
  languagePreference: z.string(),
  isVerified: z.boolean(),
  accountNotes: z.string().optional(),
  sendWelcomeEmail: z.boolean(),
}).strict();

type Reservation = { user_id: string; state: "reserved" | "ready" | "complete" };

/** Auth is external to the database RPC transaction. Never delete on failure:
 * the durable reservation owns the stable UUID and retries reconcile that UUID.
 * Failed persistence leaves Auth banned; successful persistence is replayable.
 */
export async function provisionEmployee(
  supabase: SupabaseClient,
  actorId: string,
  input: z.infer<typeof employeeProvisioningSchema>,
) {
  const payload = employeeProvisioningSchema.parse(input);
  const rpc = async (phase: string) => {
    const { data, error } = await supabase.rpc("provision_employee", {
      p_actor: actorId, p_input: payload, p_phase: phase,
    });
    if (error) throw new Error(error.message);
    return data as Reservation;
  };
  let reservation = await rpc("reserve");
  if (reservation.state === "reserved") {
    const lookup = await supabase.auth.admin.getUserById(reservation.user_id);
    let identity = lookup.data?.user;
    if (!identity) {
      if (lookup.error && lookup.error.status !== 404) throw new Error(lookup.error.message);
      const created = await supabase.auth.admin.createUser({
        id: reservation.user_id,
        email: payload.email,
        password: randomBytes(32).toString("base64url"),
        email_confirm: payload.isVerified,
        ban_duration: "876000h",
        app_metadata: { employee_provisioning_id: reservation.user_id },
        user_metadata: { full_name: payload.name },
      });
      identity = created.data?.user;
      // An error or lost response may follow a committed Auth insert. Only
      // reconcile our reserved UUID, never adopt an arbitrary email match.
      if (!identity) {
        const recovered = await supabase.auth.admin.getUserById(reservation.user_id);
        identity = recovered.data?.user;
        if (!identity) throw new Error(created.error?.message || recovered.error?.message || "Auth creation pending; retry the same request.");
      }
    }
    if (identity.id !== reservation.user_id || identity.app_metadata?.employee_provisioning_id !== reservation.user_id ||
        identity.email?.toLowerCase() !== payload.email) {
      throw new Error("Reserved identity ownership mismatch; manual investigation required.");
    }
    reservation = await rpc("persist");
  }
  if (reservation.state === "ready") {
    if (payload.status === "active") {
      const activated = await supabase.auth.admin.updateUserById(reservation.user_id, { ban_duration: "none" });
      if (activated.error) throw new Error(`Employee persisted but activation pending. Retry the same request: ${activated.error.message}`);
    }
    // If this acknowledgement fails, provisioning has already committed. Report
    // success; a replay reconciles the same account rather than compensating it.
    try { await rpc("complete"); } catch { /* durable ready state is recoverable */ }
  }
  return { id: reservation.user_id, ...payload };
}
