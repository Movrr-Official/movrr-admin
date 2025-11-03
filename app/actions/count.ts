"use server";

import { createSupabaseServerClient } from "@/lib/supabase-server";

export interface WaitlistCounts {
  totalWaitlist: number;
}

/**
 * Server action to get all counts including waitlist
 */
export async function getDashboardCounts(): Promise<WaitlistCounts> {
  try {
    const supabase = await createSupabaseServerClient();

    // Fetch all counts in parallel for better performance
    const [waitlistResult] = await Promise.all([
      // Waitlist count
      supabase.from("waitlist").select("id", { count: "exact", head: true }),
    ]);

    return {
      totalWaitlist: waitlistResult.count || 0,
    };
  } catch (error) {
    console.error("Error fetching dashboard counts:", error);
    // Return zeros if there's an error
    return {
      totalWaitlist: 0,
    };
  }
}
