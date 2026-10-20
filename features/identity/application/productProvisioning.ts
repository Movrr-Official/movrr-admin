import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";

export const advertiserProvisioningSchema = z.object({
  companyName: z.string().trim().min(2), website: z.string().optional(),
  logoUrl: z.string().url().optional(), industry: z.string().optional(),
  language: z.string().default("en"), timezone: z.string().default("UTC"),
  budget: z.number().nonnegative().default(0),
  emailNotifications: z.boolean().default(true), campaignUpdates: z.boolean().default(true),
}).strict();
export const productProvisioningSchema = z.object({
  email: z.string().trim().email().transform(v => v.toLowerCase()),
  name: z.string().trim().min(1).max(100), role: z.enum(["rider", "advertiser"]),
  status: z.enum(["active", "inactive", "pending"]),
  phone: z.string().optional(), organization: z.string().optional(),
  languagePreference: z.string(), isVerified: z.boolean(), emailVerified: z.boolean().optional(), accountNotes: z.string().optional(),
  city: z.string().optional(), country: z.string().optional(), waitlistId: z.string().uuid().optional(), waitlistReason: z.string().optional(),
  advertiserProfile: advertiserProvisioningSchema.optional(),
}).strict().superRefine((v, ctx) => {
  if (v.role === "advertiser" && !v.advertiserProfile) ctx.addIssue({ code: "custom", message: "Advertiser profile required" });
  if (v.role === "rider" && v.advertiserProfile) ctx.addIssue({ code: "custom", message: "Rider cannot receive advertiser profile" });
  if (v.waitlistId && v.role !== "rider") ctx.addIssue({ code: "custom", message: "Waitlist conversion requires Rider" });
  if (v.role === "rider" && !v.waitlistId && (!v.city?.trim() || !v.country?.trim())) ctx.addIssue({ code: "custom", message: "Rider city and country required" });
});

/** A durable database reservation precedes Auth insertion. A namespaced stable
 * UUID reconciles creation/lost-response retries; server-owned Auth metadata is
 * an ownership marker, not the source of role or provisioning stage authority.
 */
export async function provisionProduct(supabase: SupabaseClient, actor: string, raw: z.infer<typeof productProvisioningSchema>) {
  const input = productProvisioningSchema.parse(raw);
  const hex = createHash("sha256").update(`movrr-admin-product-v1:${input.email}`).digest("hex");
  const id = `${hex.slice(0,8)}-${hex.slice(8,12)}-5${hex.slice(13,16)}-a${hex.slice(17,20)}-${hex.slice(20,32)}`;
  const fingerprint = createHash("sha256").update(JSON.stringify({ actor, input })).digest("hex");
  // Database validates current authorization and checks for an existing email
  // before any Auth side effects. It also validates the waitlist ownership link.
  const preflight = await supabase.rpc("provision_product", { p_actor: actor, p_id: id, p_input: input, p_fingerprint: fingerprint, p_phase: "validate" });
  if (preflight.error) throw new Error(preflight.error.message);
  if (preflight.data?.state === "complete") return { id, ...input };
  let lookup = await supabase.auth.admin.getUserById(id);
  let user = lookup.data?.user;
  if (!user) {
    if (preflight.data?.state !== "reserved") throw new Error("Provisioned identity missing; manual investigation required.");
    if (lookup.error && lookup.error.status !== 404) throw new Error(lookup.error.message);
    const result = await supabase.auth.admin.createUser({
      id, email: input.email, password: randomBytes(32).toString("base64url"),
      email_confirm: input.emailVerified ?? input.isVerified, ban_duration: "876000h",
      app_metadata: { admin_product_provisioning: { actor, fingerprint } },
      user_metadata: { full_name: input.name, server_assigned_role: input.role,
        city: input.city, country: input.country, phone: input.phone,
        companyName: input.advertiserProfile?.companyName, language: input.languagePreference },
    });
    user = result.data?.user;
    if (!user) {
      lookup = await supabase.auth.admin.getUserById(id); user = lookup.data?.user;
      if (!user) throw new Error(result.error?.message || lookup.error?.message || "Product Auth creation pending; retry the same request.");
    }
  }
  const journal = user.app_metadata?.admin_product_provisioning;
  if (user.id !== id || journal?.fingerprint !== fingerprint || journal?.actor !== actor || user.email?.toLowerCase() !== input.email) {
    throw new Error("Conflicting product provisioning request; existing identity preserved.");
  }
  {
    const persisted = await supabase.rpc("provision_product", { p_actor: actor, p_id: id, p_input: input, p_fingerprint: fingerprint, p_phase: "persist" });
    if (persisted.error) throw new Error(persisted.error.message);
    if (input.status === "active") {
      const activated = await supabase.auth.admin.updateUserById(id, { ban_duration: "none" });
      if (activated.error) throw new Error(`Account persisted; activation pending. Retry the same request: ${activated.error.message}`);
    }
    // No error after external activation can turn a committed account into an
    // apparent rollback. The durable ready marker remains safe to reconcile.
    try {
      await supabase.rpc("provision_product", { p_actor: actor, p_id: id, p_input: input, p_fingerprint: fingerprint, p_phase: "complete" });
    } catch { /* The committed ready reservation remains recoverable. */ }
  }
  return { id, ...input };
}
