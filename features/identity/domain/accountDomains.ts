import { z } from "zod";
import { CANONICAL_EMPLOYEE_ROLES } from "@/features/organisations/domain/employeeRoleTemplates";

export const ACCOUNT_DOMAINS = ["rider", "partner", "advertiser", "government", "staff"] as const;
export const accountDomainSchema = z.enum(ACCOUNT_DOMAINS);
export type AccountDomain = z.infer<typeof accountDomainSchema>;
// Creation can deliberately add no relationship. User is not another role.
export const ACCOUNT_CREATION_OPTIONS = ["user", ...ACCOUNT_DOMAINS] as const;
export const accountCreationDomainSchema = z.enum(ACCOUNT_CREATION_OPTIONS);
export type AccountCreationDomain = z.infer<typeof accountCreationDomainSchema>;
export const ORGANISATION_TYPES = { partner: "reward_partner", advertiser: "advertiser", government: "government" } as const;
export const MEMBERSHIP_ROLES = ["owner", "manager", "partner_operations_manager", "staff", "viewer"] as const;
export function rolesForDomain(domain: AccountCreationDomain): readonly string[] {
  return domain === "user" ? [] : domain === "rider" ? ["rider"] : domain === "staff" ? CANONICAL_EMPLOYEE_ROLES : domain === "government" ? ["owner", "viewer"] : domain === "advertiser" ? ["owner", "manager", "staff", "viewer"] : MEMBERSHIP_ROLES;
}
export function accountRoleLabel(domain: AccountCreationDomain, role: string): string {
  return role.split("_").map(part => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}
export const externalAccountSchema = z.object({
  domain: z.enum(["partner", "advertiser", "government"]),
  organisationId: z.string().uuid(), role: z.enum(MEMBERSHIP_ROLES),
  email: z.string().trim().email().transform(value => value.toLowerCase()),
  name: z.string().trim().min(1).max(100),
  status: z.enum(["active", "inactive", "pending"]),
  membershipStatus: z.enum(["active", "invited"]).default("active"),
  isVerified: z.boolean(), languagePreference: z.string(),
  phone: z.string().optional(), accountNotes: z.string().optional(),
}).strict().superRefine((value, context) => {
  if (!rolesForDomain(value.domain).includes(value.role)) context.addIssue({ code: "custom", message: "Role is invalid for this account domain", path: ["role"] });
});
