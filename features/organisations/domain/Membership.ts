import type { MembershipRole } from "@/features/organisations/domain/CapabilityCatalog";

export type MembershipStatus = "active" | "invited" | "revoked";

export type OrganisationMembership = {
  id: string;
  organisationId: string;
  userId: string;
  role: MembershipRole;
  /** Assigned permission bundle key (defaults from role when omitted at create). */
  bundleKey: string;
  status: MembershipStatus;
  createdAt: string;
  updatedAt: string;
};
