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
  business_category?: string | null;
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
    businessCategory: row.business_category ?? null,
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
      "id, name, website, logo_url, contact_email, business_category, status, organisation_id, created_at, updated_at",
    )
    .eq("organisation_id", organisationId)
    .maybeSingle();
  throwOnError(error, "findRewardPartnerByOrganisationId");
  return data ? mapRewardPartnerProfile(data as RewardPartnerRow) : null;
}

/** Durable OrganisationListPort backed by public.organisation / membership,
 *  and dual-writes public.reward_partner when type = reward_partner.
 */
export function createSupabaseOrganisationOpsStore(): OrganisationListPort {
  const store: OrganisationListPort = {
    async createOrganisation(input) {
      const supabase = createSupabaseAdminClient();
      const { data, error } = await supabase.rpc("save_organisation_with_partner", { p_id: null, p_input: input });
      throwOnError(error, "createOrganisation.atomic");
      const result = data as { organisation: OrganisationRow; partner: RewardPartnerRow | null };
      const organisation = mapOrganisation(result.organisation);
      if (result.partner) organisation.partnerProfile = mapRewardPartnerProfile(result.partner);
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

      const { data: membershipRows, error: membershipError } = await supabase
        .from("organisation_membership")
        .select("status")
        .eq("organisation_id", organisation.id);
      throwOnError(membershipError, "findOrganisationById.memberships");
      const members = membershipRows ?? [];
      organisation.memberCount = members.filter(
        (row) => row.status !== "revoked",
      ).length;
      organisation.activeMemberCount = members.filter(
        (row) => row.status === "active",
      ).length;

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
      const rows = (data ?? []) as OrganisationRow[];
      if (rows.length === 0) return [];

      const ids = rows.map((row) => row.id);
      const { data: membershipRows, error: membershipError } = await supabase
        .from("organisation_membership")
        .select("organisation_id, status")
        .in("organisation_id", ids);
      throwOnError(membershipError, "listOrganisations.memberships");

      const memberTotals = new Map<string, { total: number; active: number }>();
      for (const membership of membershipRows ?? []) {
        const orgId = membership.organisation_id as string;
        const current = memberTotals.get(orgId) ?? { total: 0, active: 0 };
        if (membership.status !== "revoked") {
          current.total += 1;
        }
        if (membership.status === "active") {
          current.active += 1;
        }
        memberTotals.set(orgId, current);
      }

      const rewardPartnerIds = rows
        .filter((row) => row.type === "reward_partner")
        .map((row) => row.id);
      const profilesByOrgId = new Map<string, RewardPartnerProfile>();
      if (rewardPartnerIds.length > 0) {
        const { data: partnerRows, error: partnerError } = await supabase
          .from("reward_partner")
          .select(
            "id, name, website, logo_url, contact_email, business_category, status, organisation_id, created_at, updated_at",
          )
          .in("organisation_id", rewardPartnerIds);
        throwOnError(partnerError, "listOrganisations.partnerProfiles");
        for (const partner of (partnerRows ?? []) as RewardPartnerRow[]) {
          if (partner.organisation_id) {
            profilesByOrgId.set(
              partner.organisation_id,
              mapRewardPartnerProfile(partner),
            );
          }
        }
      }

      return rows.map((row) => {
        const organisation = mapOrganisation(row);
        const counts = memberTotals.get(row.id);
        organisation.memberCount = counts?.total ?? 0;
        organisation.activeMemberCount = counts?.active ?? 0;
        if (row.type === "reward_partner") {
          organisation.partnerProfile = profilesByOrgId.get(row.id) ?? null;
        }
        return organisation;
      });
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
      const { data, error } = await createSupabaseAdminClient().rpc("save_organisation_with_partner", { p_id: input.id, p_input: input });
      throwOnError(error, "updateOrganisation.atomic");
      if (!data) return null;
      const result = data as { organisation: OrganisationRow; partner: RewardPartnerRow | null };
      const organisation = mapOrganisation(result.organisation);
      if (result.partner) organisation.partnerProfile = mapRewardPartnerProfile(result.partner);
      return organisation;
    },
  };

  return store;
}
