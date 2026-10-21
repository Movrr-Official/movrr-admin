import type { OrganisationMembership } from "@/features/organisations/domain/Membership";
import {
  ORG_ROLE_BUNDLE_KEYS,
  isMembershipRole,
  capabilitiesForMembership,
} from "@/features/organisations/domain/CapabilityCatalog";
import type {
  AddMemberInput,
  OrganisationRepository,
} from "@/features/organisations/application/contracts/OrganisationRepository";
import {
  fail,
  ok,
  type ApplicationResult,
} from "@/lib/result/ApplicationResult";

export async function addMember(
  input: AddMemberInput,
  deps: { organisations: OrganisationRepository },
): Promise<ApplicationResult<OrganisationMembership>> {
  if (!input.organisationId?.trim()) {
    return fail("validation_failed", "organisationId is required");
  }
  if (!input.userId?.trim()) {
    return fail("validation_failed", "userId is required");
  }
  if (!isMembershipRole(input.role)) {
    return fail("validation_failed", "Invalid membership role");
  }

  const organisation = await deps.organisations.findOrganisationById(
    input.organisationId,
  );
  if (!organisation) {
    return fail("not_found", "Organisation not found");
  }
  if (!capabilitiesForMembership(organisation.type, input.role).length) return fail("validation_failed", "Role is invalid for the organisation domain");

  const membership = await deps.organisations.addMember({
    actorId: input.actorId,
    organisationId: input.organisationId,
    userId: input.userId,
    role: input.role,
    bundleKey: input.bundleKey ?? ORG_ROLE_BUNDLE_KEYS[input.role],
  });

  return ok(membership);
}
