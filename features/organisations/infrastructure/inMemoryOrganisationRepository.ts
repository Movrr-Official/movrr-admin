import { randomUUID } from "crypto";
import type { Organisation } from "@/features/organisations/domain/Organisation";
import type { OrganisationMembership } from "@/features/organisations/domain/Membership";
import {
  ORG_ROLE_BUNDLE_KEYS,
} from "@/features/organisations/domain/CapabilityCatalog";
import type {
  AddMemberInput,
  AssignBundleInput,
  CreateOrganisationInput,
  OrganisationRepository,
} from "@/features/organisations/application/contracts/OrganisationRepository";

/** In-memory OrganisationRepository for unit tests (no live DB). */
export function createInMemoryOrganisationRepository(): OrganisationRepository {
  const organisations = new Map<string, Organisation>();
  const memberships = new Map<string, OrganisationMembership>();

  return {
    async createOrganisation(
      input: CreateOrganisationInput,
    ): Promise<Organisation> {
      const now = new Date().toISOString();
      const organisation: Organisation = {
        id: randomUUID(),
        name: input.name,
        type: input.type,
        status: input.status ?? "active",
        createdAt: now,
        updatedAt: now,
      };
      organisations.set(organisation.id, organisation);
      return organisation;
    },

    async findOrganisationById(id: string): Promise<Organisation | null> {
      return organisations.get(id) ?? null;
    },

    async addMember(input: AddMemberInput): Promise<OrganisationMembership> {
      const now = new Date().toISOString();
      const membership: OrganisationMembership = {
        id: randomUUID(),
        organisationId: input.organisationId,
        userId: input.userId,
        role: input.role,
        bundleKey: input.bundleKey ?? ORG_ROLE_BUNDLE_KEYS[input.role],
        status: "active",
        createdAt: now,
        updatedAt: now,
      };
      memberships.set(membership.id, membership);
      return membership;
    },

    async findMembershipById(
      id: string,
    ): Promise<OrganisationMembership | null> {
      return memberships.get(id) ?? null;
    },

    async findActiveMembershipByUserId(
      userId: string,
    ): Promise<OrganisationMembership | null> {
      for (const membership of memberships.values()) {
        if (membership.userId === userId && membership.status === "active") {
          return membership;
        }
      }
      return null;
    },

    async assignBundle(
      input: AssignBundleInput,
    ): Promise<OrganisationMembership> {
      const existing = memberships.get(input.membershipId);
      if (!existing) {
        throw new Error(`Membership not found: ${input.membershipId}`);
      }
      const updated: OrganisationMembership = {
        ...existing,
        bundleKey: input.bundleKey,
        updatedAt: new Date().toISOString(),
      };
      memberships.set(updated.id, updated);
      return updated;
    },
  };
}
