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
  totalRoutes: number;
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
      totalAdvertisers: mockUsers.filter((user) => user.role === "advertiser")
        .length,
      totalCampaigns: mockCampaigns.length,
      totalRoutes: mockRoutes.length,
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
    ] =
      await Promise.all([
        // Waitlist count
        supabase.from("waitlist").select("id", { count: "exact", head: true }),
        // Users count
        supabase.from("user").select("id", { count: "exact", head: true }),
        // Riders count
        supabase.from("rider").select("id", { count: "exact", head: true }),
        // Advertisers count
        supabase.from("advertiser").select("id", { count: "exact", head: true }),
        // Campaigns count
        supabase.from("campaign").select("id", { count: "exact", head: true }),
        // Routes count
        supabase.from("route").select("id", { count: "exact", head: true }),
      ]);
    return {
      totalWaitlist: waitlistResult.count || 0,
      totalUsers: usersResult.count || 0,
      totalRiders: ridersResult.count || 0,
      totalAdvertisers: advertisersResult.count || 0,
      totalCampaigns: campaignsResult.count || 0,
      totalRoutes: routesResult.count || 0,
    };
  } catch (error) {
    console.error("Error fetching dashboard counts:", error);
    // Return zeros if there's an error
    return {
      totalWaitlist: 0,
      totalUsers: 0,
      totalRiders: 0,
      totalAdvertisers: 0,
      totalCampaigns: 0,
      totalRoutes: 0,
    };
  }
}
