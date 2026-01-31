"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { createSupabaseServerClient } from "@/supabase/server";
import { WaitlistEntry } from "@/types/types";

// Utility function to generate a secure random password
function generateRandomPassword(length = 12) {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()";
  return Array.from(
    { length },
    () => chars[Math.floor(Math.random() * chars.length)],
  ).join("");
}

export async function getWaitlistData(
  searchValue?: string,
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
        `name.ilike.%${searchValue}%,email.ilike.%${searchValue}%,city.ilike.%${searchValue}%`,
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
  reason?: string,
) {
  const supabaseAdmin = createSupabaseAdminClient(); // for Auth + RLS-safe insert
  const supabase = await createSupabaseServerClient(); // for fetching waitlist and updates

  try {
    // Fetches the waitlist entry
    const { data: waitlist, error: fetchError } = await supabase
      .from("waitlist")
      .select("*")
      .eq("id", id)
      .single();

    if (fetchError || !waitlist) {
      throw new Error(fetchError?.message || "Waitlist entry not found");
    }

    // Updates the waitlist status first
    const { data: updatedWaitlist, error: updateError } = await supabase
      .from("waitlist")
      .update({
        status,
        status_reason: reason,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single();

    if (updateError) {
      throw new Error(updateError.message);
    }

    // If approved and not yet converted → creates Auth user + public.user
    if (status === "approved" && !waitlist.converted_to_user) {
      // Create Supabase Auth user via Admin API
      const { data: authUser, error: authError } =
        await supabaseAdmin.auth.admin.createUser({
          email: waitlist.email,
          password: generateRandomPassword(),
          email_confirm: true, // mark email verified
        });

      if (authError || !authUser) {
        throw new Error(
          authError?.message || "Database error creating new Auth user",
        );
      }

      // Insert into public.user with the correct ID (matches auth.users)
      const { error: profileError } = await supabaseAdmin.from("user").insert({
        id: authUser.user.id,
        email: authUser.user.email,
        name: waitlist.name,
        role: "rider",
        status: "active",
        is_verified: false,
        email_verified: true,
        verification_level: "basic",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      if (profileError) {
        throw new Error(profileError.message);
      }

      // Mark waitlist entry as converted
      const { error: waitlistConvertedError } = await supabase
        .from("waitlist")
        .update({
          converted_to_user: true,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);

      if (waitlistConvertedError) {
        throw new Error(waitlistConvertedError.message);
      }
    }

    // Revalidate waitlist page to reflect changes
    revalidatePath("/waitlist");

    return { success: true, data: updatedWaitlist };
  } catch (error) {
    console.error("Status update error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to update status",
    };
  }
}
