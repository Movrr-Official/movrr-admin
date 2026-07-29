import type { Organisation } from "@/features/organisations/domain/Organisation";
import type {
  CreateOrganisationInput,
  OrganisationRepository,
} from "@/features/organisations/application/contracts/OrganisationRepository";
import {
  fail,
  ok,
  type ApplicationResult,
} from "@/lib/result/ApplicationResult";

export async function createOrganisation(
  input: CreateOrganisationInput,
  deps: { organisations: OrganisationRepository },
): Promise<ApplicationResult<Organisation>> {
  const name = input.name?.trim();
  if (!name) {
    return fail("validation_failed", "Organisation name is required");
  }
  if (!input.type) {
    return fail("validation_failed", "Organisation type is required");
  }

  const organisation = await deps.organisations.createOrganisation({
    name,
    type: input.type,
    status: input.status ?? "active",
  });

  return ok(organisation);
}
