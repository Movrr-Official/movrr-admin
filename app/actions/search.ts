"use server";

import { createSupabaseAdminClient } from "@/lib/supabase-admin";

export interface SearchResult {
  id: string;
  type: "rider" | "campaign" | "city" | "user";
  name: string;
  email?: string;
  description?: string;
  route?: string;
  avatarUrl?: string;
  status?: string;
  relevance?: number; // For sorting by relevance
}

export async function globalSearch(query: string): Promise<SearchResult[]> {
  if (!query.trim() || query.length < 2) {
    return [];
  }

  try {
    const supabase = createSupabaseAdminClient();
    const searchTerm = `%${query.trim()}%`;

    // Search across multiple tables with better relevance scoring
    const [ridersResult, campaignsResult, usersResult] = await Promise.all([
      // Search riders - prioritize name matches
      supabase
        .from("riders")
        .select("id, name, email, current_route, avatar_url, status")
        .or(
          `name.ilike.${searchTerm},email.ilike.${searchTerm},current_route.ilike.${searchTerm}`
        )
        .limit(8),

      // Search campaigns
      supabase
        .from("campaigns")
        .select("id, name, description, status")
        .or(`name.ilike.${searchTerm},description.ilike.${searchTerm}`)
        .limit(8),

      // Search users
      supabase
        .from("profiles")
        .select("id, full_name, email, avatar_url")
        .or(`full_name.ilike.${searchTerm},email.ilike.${searchTerm}`)
        .limit(8),
    ]);

    const results: SearchResult[] = [];

    // Process riders with relevance scoring
    if (ridersResult.data) {
      ridersResult.data.forEach((rider) => {
        let relevance = 0;
        if (rider.name?.toLowerCase().includes(query.toLowerCase()))
          relevance += 3;
        if (rider.email?.toLowerCase().includes(query.toLowerCase()))
          relevance += 2;
        if (rider.current_route?.toLowerCase().includes(query.toLowerCase()))
          relevance += 1;

        results.push({
          id: rider.id,
          type: "rider",
          name: rider.name,
          email: rider.email,
          route: rider.current_route,
          avatarUrl: rider.avatar_url,
          status: rider.status,
          relevance,
        });
      });
    }

    // Process campaigns
    if (campaignsResult.data) {
      campaignsResult.data.forEach((campaign) => {
        let relevance = 0;
        if (campaign.name?.toLowerCase().includes(query.toLowerCase()))
          relevance += 3;
        if (campaign.description?.toLowerCase().includes(query.toLowerCase()))
          relevance += 2;

        results.push({
          id: campaign.id,
          type: "campaign",
          name: campaign.name,
          description: campaign.description,
          status: campaign.status,
          relevance,
        });
      });
    }

    // Process users
    if (usersResult.data) {
      usersResult.data.forEach((user) => {
        let relevance = 0;
        if (user.full_name?.toLowerCase().includes(query.toLowerCase()))
          relevance += 3;
        if (user.email?.toLowerCase().includes(query.toLowerCase()))
          relevance += 2;

        results.push({
          id: user.id,
          type: "user",
          name: user.full_name,
          email: user.email,
          avatarUrl: user.avatar_url,
          relevance,
        });
      });
    }

    // Sort by relevance and limit results
    return results
      .sort((a, b) => (b.relevance || 0) - (a.relevance || 0))
      .slice(0, 12);
  } catch (error) {
    console.error("Global search error:", error);
    return [];
  }
}
