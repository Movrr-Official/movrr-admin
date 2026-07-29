export type OrganisationType =
  | "reward_partner"
  | "advertiser"
  | "government"
  | "movrr";

export type OrganisationStatus = "active" | "inactive" | "suspended";

/** Catalog-facing partner profile linked via reward_partner.organisation_id. */
export type RewardPartnerProfile = {
  id: string;
  name: string;
  website: string | null;
  logoUrl: string | null;
  contactEmail: string | null;
  status: string;
  organisationId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Organisation = {
  id: string;
  name: string;
  type: OrganisationType;
  status: OrganisationStatus;
  createdAt: string;
  updatedAt: string;
  /** Present when type is reward_partner and a linked catalog profile exists. */
  partnerProfile?: RewardPartnerProfile | null;
  /** Active + invited memberships when list/detail enrichment is available. */
  memberCount?: number;
  /** Memberships with status active (fulfilment/tenancy staffing signal). */
  activeMemberCount?: number;
};
