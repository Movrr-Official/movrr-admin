"use server";

import { revalidatePath } from "next/cache";
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

export async function updateWaitlistStatus(
  id: string,
  status: "pending" | "approved" | "rejected",
  reason?: string
) {
  const supabase = await createSupabaseServerClient();

  try {
    const { data, error } = await supabase
      .from("waitlist")
      .update({
        status,
        status_reason: reason,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error("Supabase error:", error);
      throw new Error(`Failed to update status: ${error.message}`);
    }

    // Revalidate the waitlist page to reflect changes
    revalidatePath("/waitlist");

    return { success: true, data };
  } catch (error) {
    console.error("Status update error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to update status",
    };
  }
}
