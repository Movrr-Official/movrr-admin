/**
 * Shared Admin entity detail routes.
 * Canonical destinations for drawers (`?id=`) and dedicated detail pages.
 * Consumed by Global Search registry and module deep-links.
 */

import { FULFILMENT_ROUTES, REWARDS_ROUTES } from "@/lib/adminIaRoutes";

/** Build `/path?id=<id>` (and optional extra query keys). */
export function buildDrawerQueryHref(
  pathname: string,
  id: string,
  extraParams?: Record<string, string>,
): string {
  const params = new URLSearchParams(extraParams);
  params.set("id", id);
  return `${pathname}?${params.toString()}`;
}

export const ADMIN_ENTITY_ROUTES = {
  users: "/users",
  userDetail: (id: string) => buildDrawerQueryHref("/users", id),

  riders: "/riders",
  riderDetail: (id: string) => buildDrawerQueryHref("/riders", id),

  campaigns: "/campaigns",
  campaignDetail: (id: string) => buildDrawerQueryHref("/campaigns", id),

  advertisers: "/advertisers",
  advertiserDetail: (id: string) => buildDrawerQueryHref("/advertisers", id),

  routes: "/routes",
  routeDetail: (id: string) => buildDrawerQueryHref("/routes", id),

  rideSessions: "/ride-sessions",
  rideSessionDetail: (id: string) => buildDrawerQueryHref("/ride-sessions", id),

  communityRides: "/community-rides",
  communityRideDetail: (id: string) =>
    buildDrawerQueryHref("/community-rides", id),

  /** Reward catalog item drawer on the catalog section. */
  rewardCatalogDetail: (id: string) =>
    buildDrawerQueryHref(REWARDS_ROUTES.root, id, { section: "catalog" }),

  partners: FULFILMENT_ROUTES.partners,
  partnerDetail: FULFILMENT_ROUTES.partnerDetail,

  organisations: FULFILMENT_ROUTES.organisations,
  organisationDetail: FULFILMENT_ROUTES.organisationDetail,

  /** Dedicated detail page (not a drawer). */
  fulfilmentQueueDetail: FULFILMENT_ROUTES.detail,
} as const;
