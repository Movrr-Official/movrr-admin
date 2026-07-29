import type { Organisation } from "@/features/organisations/domain/Organisation";
import type { OrganisationMembership } from "@/features/organisations/domain/Membership";
import type { MembershipRole } from "@/features/organisations/domain/CapabilityCatalog";

export type CreateOrganisationInput = {
  name: string;
  type: Organisation["type"];
  status?: Organisation["status"];
};

export type AddMemberInput = {
  organisationId: string;
  userId: string;
  role: MembershipRole;
  bundleKey?: string;
};

export type AssignBundleInput = {
  membershipId: string;
  bundleKey: string;
};

export type OrganisationRepository = {
  createOrganisation(input: CreateOrganisationInput): Promise<Organisation>;
  findOrganisationById(id: string): Promise<Organisation | null>;
  addMember(input: AddMemberInput): Promise<OrganisationMembership>;
  findMembershipById(id: string): Promise<OrganisationMembership | null>;
  findActiveMembershipByUserId(
    userId: string,
  ): Promise<OrganisationMembership | null>;
  assignBundle(input: AssignBundleInput): Promise<OrganisationMembership>;
};
