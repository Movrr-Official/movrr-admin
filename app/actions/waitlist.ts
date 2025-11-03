"use server";

import { createSupabaseServerClient } from "@/supabase/server";
import { WaitlistEntry } from "@/types/types";

export async function getWaitlistData(
  searchValue?: string
): Promise<WaitlistEntry[]> {
  const supabase = await createSupabaseServerClient();

  try {
    // Build the query
    let query = supabase
      .from("waitlist")
      .select("*")
      .order("created_at", { ascending: false });

    // Apply search filter if searchValue exists
    if (searchValue) {
      query = query.or(
        `name.ilike.%${searchValue}%,email.ilike.%${searchValue}%,city.ilike.%${searchValue}%`
      );
    }

    const { data: waitlistEntries, error } = await query;

    if (error) {
      console.error("Error fetching waitlist:", error);
      throw new Error("Failed to fetch waitlist data");
    }

    return waitlistEntries || [];
  } catch (error) {
    console.error("Error in getWaitlistData:", error);
    throw new Error("Failed to fetch waitlist data");
  }
}
