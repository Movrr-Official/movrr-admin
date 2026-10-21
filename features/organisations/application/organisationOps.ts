import { isPartnerBusinessCategory, type PartnerBusinessCategory } from "@/contracts/partnerBusinessCategory";
import { randomUUID } from "crypto";
import { fail, ok, type ApplicationResult } from "@/lib/result/ApplicationResult";
import type { RequestContext } from "@/features/identity/domain/Principal";
import type { AuthorisationService } from "@/features/organisations/application/contracts/AuthorisationService";
import type { Organisation } from "@/features/organisations/domain/Organisation";
import type { OrganisationMembership } from "@/features/organisations/domain/Membership";
import type { MembershipRole } from "@/features/organisations/domain/CapabilityCatalog";
import {
  isMembershipRole,
  ORG_ROLE_BUNDLE_KEYS,
} from "@/features/organisations/domain/CapabilityCatalog";
import { createOrganisation } from "@/features/organisations/application/commands/createOrganisation";
import { addMember } from "@/features/organisations/application/commands/addMember";
import type { OrganisationRepository } from "@/features/organisations/application/contracts/OrganisationRepository";

export type OrganisationOpsQueries = {
  list: (
    ctx: RequestContext,
    filter?: { type?: Organisation["type"] },
  ) => Promise<ApplicationResult<Organisation[]>>;
  getById: (
    ctx: RequestContext,
    id: string,
  ) => Promise<ApplicationResult<Organisation>>;
  listStaff: (
    ctx: RequestContext,
    organisationId: string,
  ) => Promise<ApplicationResult<OrganisationMembership[]>>;
};

export type UpdateOrganisationInput = {
  id: string;
  name?: string;
  status?: Organisation["status"];
  partnerProfile?: {
    businessCategory?: PartnerBusinessCategory | null;
    contactEmail?: string | null;
    website?: string | null;
    logoUrl?: string | null;
  };
};

export type OrganisationOpsCommands = {
  create: (
    ctx: RequestContext,
    input: { name: string; type: Organisation["type"]; operationId?: string },
  ) => Promise<ApplicationResult<Organisation>>;
  update: (
    ctx: RequestContext,
    input: UpdateOrganisationInput,
  ) => Promise<ApplicationResult<Organisation>>;
  addStaff: (
    ctx: RequestContext,
    input: {
      organisationId: string;
      userId: string;
      role: MembershipRole;
    },
  ) => Promise<ApplicationResult<OrganisationMembership>>;
  updateStaffRole: (
    ctx: RequestContext,
    input: {
      organisationId: string;
      membershipId: string;
      expectedUpdatedAt?: string;
      status?: OrganisationMembership["status"];
      role: MembershipRole;
    },
  ) => Promise<ApplicationResult<OrganisationMembership>>;
};

export type OrganisationListPort = OrganisationRepository & {
  listOrganisations: (filter?: {
    type?: Organisation["type"];
  }) => Promise<Organisation[]>;
  listMembersByOrganisation: (
    organisationId: string,
  ) => Promise<OrganisationMembership[]>;
  updateMemberRole: (input: {
    actorId?: string;
    expectedUpdatedAt?: string;
    status?: OrganisationMembership["status"];
    membershipId: string;
    organisationId: string;
    role: MembershipRole;
  }) => Promise<OrganisationMembership | null>;
  updateOrganisation: (
    input: UpdateOrganisationInput,
  ) => Promise<Organisation | null>;
};

/** Process-local ops store for tests / local composition without Supabase. */
let sharedOpsStore: OrganisationListPort | null = null;

export function getSharedOrganisationOpsStore(): OrganisationListPort {
  if (!sharedOpsStore) {
    sharedOpsStore = createOrganisationOpsStore();
  }
  return sharedOpsStore;
}

export function createOrganisationOpsStore(): OrganisationListPort {
  const organisations = new Map<string, Organisation>();
  const memberships = new Map<string, OrganisationMembership>();

  return {
    async createOrganisation(input) {
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
    async findOrganisationById(id) {
      return organisations.get(id) ?? null;
    },
    async addMember(input) {
      for (const existing of memberships.values()) {
        if (existing.organisationId === input.organisationId && existing.userId === input.userId) {
          if (existing.role === input.role && existing.bundleKey === (input.bundleKey ?? ORG_ROLE_BUNDLE_KEYS[input.role]) && existing.status === "active") return existing;
          throw new Error("Membership already exists with different access; use the authorized role update workflow");
        }
      }
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
    async findMembershipById(id) {
      return memberships.get(id) ?? null;
    },
    async findActiveMembershipByUserId(userId) {
      for (const membership of memberships.values()) {
        if (membership.userId === userId && membership.status === "active") {
          return membership;
        }
      }
      return null;
    },
    async listOrganisations(filter) {
      return [...organisations.values()]
        .filter((org) => (filter?.type ? org.type === filter.type : true))
        .map((org) => {
          const members = [...memberships.values()].filter(
            (m) => m.organisationId === org.id,
          );
          return {
            ...org,
            memberCount: members.filter((m) => m.status !== "revoked").length,
            activeMemberCount: members.filter((m) => m.status === "active")
              .length,
          };
        });
    },
    async listMembersByOrganisation(organisationId) {
      return [...memberships.values()].filter(
        (m) => m.organisationId === organisationId,
      );
    },
    async updateMemberRole(input) {
      const existing = memberships.get(input.membershipId);
      if (!existing || existing.organisationId !== input.organisationId) {
        return null;
      }
      const updated: OrganisationMembership = {
        ...existing,
        role: input.role,
        bundleKey: ORG_ROLE_BUNDLE_KEYS[input.role],
        status: input.status ?? existing.status,
        updatedAt: new Date().toISOString(),
      };
      memberships.set(updated.id, updated);
      return updated;
    },
    async updateOrganisation(input) {
      const existing = organisations.get(input.id);
      if (!existing) return null;
      const now = new Date().toISOString();
      const partnerProfile =
        existing.type === "reward_partner"
          ? {
              ...(existing.partnerProfile ?? {
                id: randomUUID(),
                name: input.name?.trim() || existing.name,
                website: null,
                logoUrl: null,
                contactEmail: null,
                status: existing.status === "active" ? "active" : "inactive",
                organisationId: existing.id,
                createdAt: existing.createdAt,
                updatedAt: now,
              }),
              name: input.name?.trim() || existing.name,
              status:
                (input.status ?? existing.status) === "active"
                  ? "active"
                  : "inactive",
              businessCategory: input.partnerProfile?.businessCategory !== undefined
                ? input.partnerProfile.businessCategory
                : (existing.partnerProfile?.businessCategory ?? null),
              contactEmail:
                input.partnerProfile?.contactEmail !== undefined
                  ? input.partnerProfile.contactEmail
                  : (existing.partnerProfile?.contactEmail ?? null),
              website:
                input.partnerProfile?.website !== undefined
                  ? input.partnerProfile.website
                  : (existing.partnerProfile?.website ?? null),
              logoUrl:
                input.partnerProfile?.logoUrl !== undefined
                  ? input.partnerProfile.logoUrl
                  : (existing.partnerProfile?.logoUrl ?? null),
              updatedAt: now,
            }
          : existing.partnerProfile;
      const updated: Organisation = {
        ...existing,
        name: input.name?.trim() || existing.name,
        status: input.status ?? existing.status,
        updatedAt: now,
        partnerProfile,
      };
      organisations.set(updated.id, updated);
      return updated;
    },
  };
}

export function createOrganisationOpsQueries(deps: {
  authorisation: AuthorisationService;
  store: OrganisationListPort;
}): OrganisationOpsQueries {
  return {
    async list(ctx, filter) {
      const authz = deps.authorisation.assertCapability(ctx, "rewards.manage");
      if (!authz.ok) return authz;
      return ok(await deps.store.listOrganisations(filter));
    },
    async getById(ctx, id) {
      const authz = deps.authorisation.assertCapability(ctx, "rewards.manage");
      if (!authz.ok) return authz;
      const organisation = await deps.store.findOrganisationById(id);
      if (!organisation) return fail("not_found", "Organisation not found");
      return ok(organisation);
    },
    async listStaff(ctx, organisationId) {
      const authz = deps.authorisation.assertCapability(ctx, "staff.manage");
      if (!authz.ok) return authz;
      if (ctx.principal.type !== "admin" &&
          (ctx.principal.type !== "organisation" || ctx.principal.organisationId !== organisationId)) {
        return fail("permission_denied", "Cannot inspect another organisation's staff");
      }
      return ok(await deps.store.listMembersByOrganisation(organisationId));
    },
  };
}

export function createOrganisationOpsCommands(deps: {
  authorisation: AuthorisationService;
  store: OrganisationListPort;
}): OrganisationOpsCommands {
  return {
    async create(ctx, input) {
      const authz = deps.authorisation.assertCapability(ctx, "rewards.manage");
      if (!authz.ok) return authz;
      if (ctx.principal.type !== "admin") return fail("permission_denied", "Organisation creation requires Admin authorization");
      return createOrganisation({ ...input, actorId: ctx.principal.userId }, { organisations: deps.store });
    },
    async update(ctx, input) {
      const authz = deps.authorisation.assertCapability(ctx, "rewards.manage");
      if (!authz.ok) return authz;
      if (ctx.principal.type !== "admin" &&
          (ctx.principal.type !== "organisation" || ctx.principal.organisationId !== input.id)) {
        return fail("permission_denied", "Cannot change another organisation");
      }
      if (input.name !== undefined && !input.name.trim()) {
        return fail("validation_failed", "Organisation name is required");
      }
      if (
        input.status !== undefined &&
        input.status !== "active" &&
        input.status !== "inactive" &&
        input.status !== "suspended"
      ) {
        return fail("validation_failed", "Invalid organisation status");
      }
      if (input.partnerProfile?.businessCategory !== undefined) {
        // Organisation owners/managers also have rewards.manage; classification is Admin-only.
        if (ctx.principal.type !== "admin") return fail("permission_denied", "Admin category management required");
        const category = input.partnerProfile.businessCategory;
        if (category !== null && !isPartnerBusinessCategory(category)) return fail("validation", "Invalid business category");
        const existing = await deps.store.findOrganisationById(input.id);
        if (!existing) return fail("not_found", "Organisation not found");
        if (existing.type !== "reward_partner") return fail("validation", "Business category requires a reward partner");
      }
      const updated = await deps.store.updateOrganisation(input);
      if (!updated) return fail("not_found", "Organisation not found");
      return ok(updated);
    },
    async addStaff(ctx, input) {
      const authz = deps.authorisation.assertCapability(ctx, "staff.manage");
      if (!authz.ok) return authz;
      if (ctx.principal.type !== "admin" &&
          (ctx.principal.type !== "organisation" || ctx.principal.organisationId !== input.organisationId)) {
        return fail("permission_denied", "Cannot staff another organisation");
      }
      if (ctx.principal.type !== "admin" && input.role === "owner") {
        return fail("permission_denied", "Ownership assignment requires Admin authorization");
      }
      if (ctx.principal.type === "organisation" && ctx.principal.role === "partner_operations_manager" && !["staff", "viewer"].includes(input.role)) return fail("permission_denied", "Partner Operations Managers may administer only operational staff and viewers");
      if (!isMembershipRole(input.role)) {
        return fail("validation_failed", "Invalid membership role");
      }
      return addMember({ ...input, actorId: ctx.principal.userId }, { organisations: deps.store });
    },
    async updateStaffRole(ctx, input) {
      const authz = deps.authorisation.assertCapability(ctx, "staff.manage");
      if (!authz.ok) return authz;
      if (ctx.principal.type !== "admin" &&
          (ctx.principal.type !== "organisation" || ctx.principal.organisationId !== input.organisationId || input.role === "owner")) {
        return fail("permission_denied", "Cannot assign ownership or staff another organisation");
      }
      if (!isMembershipRole(input.role)) {
        return fail("validation_failed", "Invalid membership role");
      }
      if (ctx.principal.type !== "admin") {
        const existing = await deps.store.findMembershipById(input.membershipId);
        if (!existing || existing.organisationId !== input.organisationId || existing.role === "owner") {
          return fail("permission_denied", "Ownership changes require Admin authorization");
        }
        if (ctx.principal.type === "organisation" && ctx.principal.role === "partner_operations_manager" &&
            (!["staff", "viewer"].includes(input.role) || !["staff", "viewer"].includes(existing.role))) return fail("permission_denied", "Partner Operations Managers may administer only operational staff and viewers");
      }
      const updated = await deps.store.updateMemberRole({ ...input, actorId: ctx.principal.userId });
      if (!updated) return fail("not_found", "Membership not found");
      return ok(updated);
    },
  };
}
