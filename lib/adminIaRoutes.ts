/** Canonical Admin IA routes for Rewards and Fulfilment bounded contexts. */

export const REWARDS_ROUTES = {
  root: "/rewards",
  catalogCreate: "/rewards/catalog/create",
  section: (section: RewardsSection) =>
    section === "overview" ? "/rewards" : `/rewards?section=${section}`,
} as const;

export const REWARDS_SECTIONS = [
  "overview",
  "catalog",
  "wallet",
  "transactions",
  "analytics",
] as const;

export type RewardsSection = (typeof REWARDS_SECTIONS)[number];

export const FULFILMENT_ROUTES = {
  root: "/fulfilment",
  queue: "/fulfilment/queue",
  detail: (id: string) => `/fulfilment/queue/${encodeURIComponent(id)}`,
  timeline: "/fulfilment/timeline",
  resourcePools: "/fulfilment/resource-pools",
  collections: "/fulfilment/collections",
  partners: "/fulfilment/partners",
  partnerCreate: "/fulfilment/partners/create",
  partnerDetail: (id: string) =>
    `/fulfilment/partners/${encodeURIComponent(id)}`,
  organisations: "/fulfilment/organisations",
  analytics: "/fulfilment/analytics",
} as const;

export const FULFILMENT_NAV = [
  { label: "Overview", href: FULFILMENT_ROUTES.root },
  { label: "Queue", href: FULFILMENT_ROUTES.queue },
  { label: "Timeline", href: FULFILMENT_ROUTES.timeline },
  { label: "Resource Pools", href: FULFILMENT_ROUTES.resourcePools },
  { label: "Collections", href: FULFILMENT_ROUTES.collections },
  { label: "Partner Operations", href: FULFILMENT_ROUTES.partners },
  { label: "Organisations", href: FULFILMENT_ROUTES.organisations },
  { label: "Analytics", href: FULFILMENT_ROUTES.analytics },
] as const;

export const REWARDS_NAV = [
  { label: "Overview", href: REWARDS_ROUTES.section("overview"), section: "overview" },
  { label: "Catalog", href: REWARDS_ROUTES.section("catalog"), section: "catalog" },
  { label: "Wallet", href: REWARDS_ROUTES.section("wallet"), section: "wallet" },
  {
    label: "Transactions",
    href: REWARDS_ROUTES.section("transactions"),
    section: "transactions",
  },
  {
    label: "Analytics",
    href: REWARDS_ROUTES.section("analytics"),
    section: "analytics",
  },
] as const;

export function parseRewardsSection(
  value: string | null | undefined,
): RewardsSection {
  if (
    value === "catalog" ||
    value === "wallet" ||
    value === "transactions" ||
    value === "analytics"
  ) {
    return value;
  }
  return "overview";
}
