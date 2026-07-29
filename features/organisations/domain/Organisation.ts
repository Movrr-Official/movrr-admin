export type OrganisationType =
  | "reward_partner"
  | "advertiser"
  | "government"
  | "movrr";

export type OrganisationStatus = "active" | "inactive" | "suspended";

export type Organisation = {
  id: string;
  name: string;
  type: OrganisationType;
  status: OrganisationStatus;
  createdAt: string;
  updatedAt: string;
};
