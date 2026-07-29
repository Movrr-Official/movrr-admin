import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import type {
  Organisation,
  RewardPartnerProfile,
} from "@/features/organisations/domain/Organisation";
import type { OrganisationMembership } from "@/features/organisations/domain/Membership";
import type { MembershipRole } from "@/features/organisations/domain/CapabilityCatalog";
import { ORG_ROLE_BUNDLE_KEYS } from "@/features/organisations/domain/CapabilityCatalog";
import type { OrganisationListPort } from "@/features/organisations/application/organisationOps";

type OrganisationRow = {
  id: string;
  name: string;
  type: Organisation["type"];
  status: Organisation["status"];
  created_at: string;
  updated_at: string;
};

type RewardPartnerRow = {
  id: string;
  name: string;
  website: string | null;
  logo_url: string | null;
  contact_email: string | null;
  status: string;
  organisation_id: string | null;
  created_at: string;
  updated_at: string;
};

type MembershipRow = {
  id: string;
  organisation_id: string;
  user_id: string;
  role: MembershipRole;
  bundle_key: string;
  status: OrganisationMembership["status"];
  created_at: string;
  updated_at: string;
};

function mapOrganisation(row: OrganisationRow): Organisation {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapRewardPartnerProfile(row: RewardPartnerRow): RewardPartnerProfile {
  return {
    id: row.id,
    name: row.name,
    website: row.website,
    logoUrl: row.logo_url,
    contactEmail: row.contact_email,
    status: row.status,
    organisationId: row.organisation_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapMembership(row: MembershipRow): OrganisationMembership {
  return {
    id: row.id,
    organisationId: row.organisation_id,
    userId: row.user_id,
    role: row.role,
    bundleKey: row.bundle_key,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function throwOnError(error: { message: string } | null, action: string): void {
  if (error) {
    throw new Error(`${action}: ${error.message}`);
  }
}

type SupabaseAdmin = ReturnType<typeof createSupabaseAdminClient>;

async function findRewardPartnerByOrganisationId(
  supabase: SupabaseAdmin,
  organisationId: string,
): Promise<RewardPartnerProfile | null> {
  const { data, error } = await supabase
    .from("reward_partner")
    .select(
      "id, name, website, logo_url, contact_email, status, organisation_id, created_at, updated_at",
    )
    .eq("organisation_id", organisationId)
    .maybeSingle();
  throwOnError(error, "findRewardPartnerByOrganisationId");
  return data ? mapRewardPartnerProfile(data as RewardPartnerRow) : null;
}

/**
 * Keep catalog `reward_partner` in sync with Organisation tenancy.
 * Prefer linking an existing same-name profile; otherwise insert a new row.
 */
async function linkRewardPartnerProfile(
  supabase: SupabaseAdmin,
  organisation: Organisation,
): Promise<void> {
  const now = new Date().toISOString();
  const { data: existing, error: lookupError } = await supabase
    .from("reward_partner")
    .select("id, organisation_id")
    .ilike("name", organisation.name)
    .maybeSingle();

  throwOnError(lookupError, "linkRewardPartnerProfile.lookup");

  if (existing?.id) {
    if (existing.organisation_id === organisation.id) {
      return;
    }
    const { error: updateError } = await supabase
      .from("reward_partner")
      .update({
        organisation_id: organisation.id,
        status: organisation.status === "active" ? "active" : "inactive",
        updated_at: now,
      })
      .eq("id", existing.id);
    throwOnError(updateError, "linkRewardPartnerProfile.update");
    return;
  }

  const { error: insertError } = await supabase.from("reward_partner").insert({
    name: organisation.name,
    status: organisation.status === "active" ? "active" : "inactive",
    organisation_id: organisation.id,
    created_at: now,
    updated_at: now,
  });
  throwOnError(insertError, "linkRewardPartnerProfile.insert");
}

/** Durable OrganisationListPort backed by public.organisation / membership,
 *  and dual-writes public.reward_partner when type = reward_partner.
 */
export function createSupabaseOrganisationOpsStore(): OrganisationListPort {
  const store: OrganisationListPort = {
    async createOrganisation(input) {
      const supabase = createSupabaseAdminClient();
      const { data, error } = await supabase
        .from("organisation")
        .insert({
          name: input.name,
          type: input.type,
          status: input.status ?? "active",
        })
        .select("id, name, type, status, created_at, updated_at")
        .single();

      throwOnError(error, "createOrganisation");
      const organisation = mapOrganisation(data as OrganisationRow);

      if (organisation.type === "reward_partner") {
        await linkRewardPartnerProfile(supabase, organisation);
      }

      return organisation;
    },

    async findOrganisationById(id) {
      const supabase = createSupabaseAdminClient();
      const { data, error } = await supabase
        .from("organisation")
        .select("id, name, type, status, created_at, updated_at")
        .eq("id", id)
        .maybeSingle();

      if (error) {
        throwOnError(error, "findOrganisationById");
      }
      if (!data) return null;

      const organisation = mapOrganisation(data as OrganisationRow);
      if (organisation.type === "reward_partner") {
        organisation.partnerProfile =
          await findRewardPartnerByOrganisationId(supabase, organisation.id);
      }
      return organisation;
    },

    async addMember(input) {
      const supabase = createSupabaseAdminClient();
      const { data, error } = await supabase
        .from("organisation_membership")
        .insert({
          organisation_id: input.organisationId,
          user_id: input.userId,
          role: input.role,
          bundle_key: input.bundleKey ?? ORG_ROLE_BUNDLE_KEYS[input.role],
          status: "active",
        })
        .select(
          "id, organisation_id, user_id, role, bundle_key, status, created_at, updated_at",
        )
        .single();

      throwOnError(error, "addMember");
      return mapMembership(data as MembershipRow);
    },

    async findMembershipById(id) {
      const supabase = createSupabaseAdminClient();
      const { data, error } = await supabase
        .from("organisation_membership")
        .select(
          "id, organisation_id, user_id, role, bundle_key, status, created_at, updated_at",
        )
        .eq("id", id)
        .maybeSingle();

      if (error) {
        throwOnError(error, "findMembershipById");
      }
      return data ? mapMembership(data as MembershipRow) : null;
    },

    async findActiveMembershipByUserId(userId) {
      const supabase = createSupabaseAdminClient();
      const { data, error } = await supabase
        .from("organisation_membership")
        .select(
          "id, organisation_id, user_id, role, bundle_key, status, created_at, updated_at",
        )
        .eq("user_id", userId)
        .eq("status", "active")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (error) {
        throwOnError(error, "findActiveMembershipByUserId");
      }
      return data ? mapMembership(data as MembershipRow) : null;
    },

    async assignBundle(input) {
      const supabase = createSupabaseAdminClient();
      const { data, error } = await supabase
        .from("organisation_membership")
        .update({
          bundle_key: input.bundleKey,
          updated_at: new Date().toISOString(),
        })
        .eq("id", input.membershipId)
        .select(
          "id, organisation_id, user_id, role, bundle_key, status, created_at, updated_at",
        )
        .maybeSingle();

      throwOnError(error, "assignBundle");
      if (!data) {
        throw new Error(`Membership not found: ${input.membershipId}`);
      }
      return mapMembership(data as MembershipRow);
    },

    async listOrganisations(filter) {
      const supabase = createSupabaseAdminClient();
      let query = supabase
        .from("organisation")
        .select("id, name, type, status, created_at, updated_at")
        .order("created_at", { ascending: false });

      if (filter?.type) {
        query = query.eq("type", filter.type);
      }

      const { data, error } = await query;
      throwOnError(error, "listOrganisations");
      return ((data ?? []) as OrganisationRow[]).map(mapOrganisation);
    },

    async listMembersByOrganisation(organisationId) {
      const supabase = createSupabaseAdminClient();
      const { data, error } = await supabase
        .from("organisation_membership")
        .select(
          "id, organisation_id, user_id, role, bundle_key, status, created_at, updated_at",
        )
        .eq("organisation_id", organisationId)
        .order("created_at", { ascending: true });

      throwOnError(error, "listMembersByOrganisation");
      return ((data ?? []) as MembershipRow[]).map(mapMembership);
    },

    async updateMemberRole(input) {
      const supabase = createSupabaseAdminClient();
      const { data, error } = await supabase
        .from("organisation_membership")
        .update({
          role: input.role,
          bundle_key: ORG_ROLE_BUNDLE_KEYS[input.role],
          updated_at: new Date().toISOString(),
        })
        .eq("id", input.membershipId)
        .eq("organisation_id", input.organisationId)
        .select(
          "id, organisation_id, user_id, role, bundle_key, status, created_at, updated_at",
        )
        .maybeSingle();

      if (error) {
        throwOnError(error, "updateMemberRole");
      }
      return data ? mapMembership(data as MembershipRow) : null;
    },

    async updateOrganisation(input) {
      const supabase = createSupabaseAdminClient();
      const existing = await store.findOrganisationById(input.id);
      if (!existing) return null;

      const now = new Date().toISOString();
      const nextName = input.name?.trim() || existing.name;
      const nextStatus = input.status ?? existing.status;

      const { data, error } = await supabase
        .from("organisation")
        .update({
          name: nextName,
          status: nextStatus,
          updated_at: now,
        })
        .eq("id", input.id)
        .select("id, name, type, status, created_at, updated_at")
        .maybeSingle();

      throwOnError(error, "updateOrganisation");
      if (!data) return null;

      const organisation = mapOrganisation(data as OrganisationRow);

      if (organisation.type === "reward_partner") {
        const partnerPatch: Record<string, string | null> = {
          name: nextName,
          status: nextStatus === "active" ? "active" : "inactive",
          updated_at: now,
        };
        if (input.partnerProfile?.contactEmail !== undefined) {
          partnerPatch.contact_email = input.partnerProfile.contactEmail;
        }
        if (input.partnerProfile?.website !== undefined) {
          partnerPatch.website = input.partnerProfile.website;
        }
        if (input.partnerProfile?.logoUrl !== undefined) {
          partnerPatch.logo_url = input.partnerProfile.logoUrl;
        }

        const { data: linked } = await supabase
          .from("reward_partner")
          .select("id")
          .eq("organisation_id", organisation.id)
          .maybeSingle();

        if (linked?.id) {
          const { error: partnerError } = await supabase
            .from("reward_partner")
            .update(partnerPatch)
            .eq("id", linked.id);
          throwOnError(partnerError, "updateOrganisation.partner");
        } else {
          await linkRewardPartnerProfile(supabase, organisation);
          if (
            input.partnerProfile?.contactEmail !== undefined ||
            input.partnerProfile?.website !== undefined ||
            input.partnerProfile?.logoUrl !== undefined
          ) {
            const { error: partnerError } = await supabase
              .from("reward_partner")
              .update(partnerPatch)
              .eq("organisation_id", organisation.id);
            throwOnError(partnerError, "updateOrganisation.partner.afterLink");
          }
        }

        organisation.partnerProfile =
          await findRewardPartnerByOrganisationId(supabase, organisation.id);
      }

      return organisation;
    },
  };

  return store;
}
