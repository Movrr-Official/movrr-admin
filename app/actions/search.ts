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
      supabase
        .from("rider")
        .select("id, status, city, user:user_id (name, email, avatar_url)")
        .or(`city.ilike.${searchTerm}`)
        .limit(8),

      supabase
        .from("campaign")
        .select("id, name, description, lifecycle_status")
        .or(`name.ilike.${searchTerm},description.ilike.${searchTerm}`)
        .limit(8),

      supabase
        .from("user")
        .select("id, name, email, avatar_url, role")
        .or(`name.ilike.${searchTerm},email.ilike.${searchTerm}`)
        .limit(8),
    ]);

    const results: SearchResult[] = [];

    // Process riders with relevance scoring
    if (ridersResult.data) {
      ridersResult.data.forEach((rider) => {
        let relevance = 0;
        const riderName = rider.user?.name ?? "";
        const riderEmail = rider.user?.email ?? "";
        if (riderName.toLowerCase().includes(query.toLowerCase()))
          relevance += 3;
        if (riderEmail.toLowerCase().includes(query.toLowerCase()))
          relevance += 2;
        if (rider.city?.toLowerCase().includes(query.toLowerCase()))
          relevance += 1;

        results.push({
          id: rider.id,
          type: "rider",
          name: riderName || "Rider",
          email: riderEmail,
          route: rider.city,
          avatarUrl: rider.user?.avatar_url,
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
          status: campaign.lifecycle_status,
          relevance,
        });
      });
    }

    // Process users
    if (usersResult.data) {
      usersResult.data.forEach((user) => {
        let relevance = 0;
        if (user.name?.toLowerCase().includes(query.toLowerCase()))
          relevance += 3;
        if (user.email?.toLowerCase().includes(query.toLowerCase()))
          relevance += 2;

        results.push({
          id: user.id,
          type: "user",
          name: user.name,
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
