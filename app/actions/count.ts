"use server";

import { DASHBOARD_ACCESS_ROLES } from "@/lib/authPermissions";
import { requireAdminRoles } from "@/lib/admin";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { shouldUseMockData } from "@/lib/dataSource";
import { mockUsers } from "@/data/mockUsers";
import { mockCampaigns } from "@/data/mockCampaigns";
import { mockRoutes } from "@/data/mockRoutes";

export interface WaitlistCounts {
  totalWaitlist: number;
  totalUsers: number;
  totalRiders: number;
  totalAdvertisers: number;
  totalCampaigns: number;
  /** Planned routes (itineraries) — not ride sessions */
  totalPlannedRoutes: number;
  /** Community rides with status upcoming (joinable) */
  totalUpcomingCommunityRides: number;
  /** Community rides currently in progress */
  totalActiveCommunityRides: number;
  /** Combined upcoming + active — used for sidebar badge */
  totalCommunityRides: number;
}

/**
 * Server action to get all counts including waitlist
 */
export async function getDashboardCounts(): Promise<WaitlistCounts> {
  await requireAdminRoles(DASHBOARD_ACCESS_ROLES);
  if (shouldUseMockData()) {
    return {
      totalWaitlist: 3,
      totalUsers: mockUsers.length,
      totalRiders: mockUsers.filter((user) => user.role === "rider").length,
      totalAdvertisers: mockUsers.filter((user) => user.role === "advertiser").length,
      totalCampaigns: mockCampaigns.length,
      totalPlannedRoutes: mockRoutes.length,
      totalUpcomingCommunityRides: 3,
      totalActiveCommunityRides: 2,
      totalCommunityRides: 5,
    };
  }
  try {
    const supabase = createSupabaseAdminClient();
    // Fetch all counts in parallel for better performance
    const [
      waitlistResult,
      usersResult,
      ridersResult,
      advertisersResult,
      campaignsResult,
      routesResult,
      upcomingRidesResult,
      activeRidesResult,
    ] = await Promise.all([
      supabase.from("waitlist").select("id", { count: "exact", head: true }),
      supabase.from("user").select("id", { count: "exact", head: true }),
      supabase.from("rider").select("id", { count: "exact", head: true }),
      supabase.from("advertiser").select("id", { count: "exact", head: true }),
      supabase.from("campaign").select("id", { count: "exact", head: true }),
      supabase.from("route").select("id", { count: "exact", head: true }),
      supabase.from("community_ride").select("id", { count: "exact", head: true }).eq("status", "upcoming"),
      supabase.from("community_ride").select("id", { count: "exact", head: true }).eq("status", "active"),
    ]);
    const upcoming = upcomingRidesResult.count || 0;
    const active = activeRidesResult.count || 0;
    return {
      totalWaitlist: waitlistResult.count || 0,
      totalUsers: usersResult.count || 0,
      totalRiders: ridersResult.count || 0,
      totalAdvertisers: advertisersResult.count || 0,
      totalCampaigns: campaignsResult.count || 0,
      totalPlannedRoutes: routesResult.count || 0,
      totalUpcomingCommunityRides: upcoming,
      totalActiveCommunityRides: active,
      totalCommunityRides: upcoming + active,
    };
  } catch (error) {
    console.error("Error fetching dashboard counts:", error);
    return {
      totalWaitlist: 0,
      totalUsers: 0,
      totalRiders: 0,
      totalAdvertisers: 0,
      totalCampaigns: 0,
      totalPlannedRoutes: 0,
      totalUpcomingCommunityRides: 0,
      totalActiveCommunityRides: 0,
      totalCommunityRides: 0,
    };
  }
}
