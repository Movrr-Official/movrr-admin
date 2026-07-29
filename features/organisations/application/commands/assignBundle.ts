import type { OrganisationMembership } from "@/features/organisations/domain/Membership";
import { BUNDLE_CAPABILITIES } from "@/features/organisations/domain/CapabilityCatalog";
import type {
  AssignBundleInput,
  OrganisationRepository,
} from "@/features/organisations/application/contracts/OrganisationRepository";
import {
  fail,
  ok,
  type ApplicationResult,
} from "@/lib/result/ApplicationResult";

export async function assignBundle(
  input: AssignBundleInput,
  deps: { organisations: OrganisationRepository },
): Promise<ApplicationResult<OrganisationMembership>> {
  if (!input.membershipId?.trim()) {
    return fail("validation_failed", "membershipId is required");
  }
  if (!input.bundleKey?.trim()) {
    return fail("validation_failed", "bundleKey is required");
  }
  if (!(input.bundleKey in BUNDLE_CAPABILITIES)) {
    return fail("validation_failed", `Unknown permission bundle: ${input.bundleKey}`);
  }

  const existing = await deps.organisations.findMembershipById(
    input.membershipId,
  );
  if (!existing) {
    return fail("not_found", "Membership not found");
  }

  const membership = await deps.organisations.assignBundle({
    membershipId: input.membershipId,
    bundleKey: input.bundleKey,
  });

  return ok(membership);
}
