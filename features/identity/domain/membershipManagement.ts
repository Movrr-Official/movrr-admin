import type { User } from "@/schemas/user";

export type AccountOrganisation = { id: string; name: string; type: string; status: string };

export type AccountMembership = NonNullable<User["memberships"]>[number] & {
  /** Read-time guidance only. The canonical command rechecks under its lock. */
  isLastActiveOwner: boolean;
};
export type MembershipResult<T> =
  | { success: true; data: T; warning?: string }
  | { success: false; error: { code: "invalid" | "denied" | "conflict" | "last_owner" | "unavailable"; message: string } };
