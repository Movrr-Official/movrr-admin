"use server";

import { revalidatePath } from "next/cache";
import { requireCapability } from "@/lib/admin";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { createSupabaseServerClient } from "@/supabase/server";
import { WaitlistEntry } from "@/types/types";
import { getPlatformOperationalPolicies } from "@/lib/platformSettings";
import { provisionProduct } from "@/features/identity/application/productProvisioning";
import { notifyAccountSetup } from "@/lib/services/accountSetupNotification";

export async function getWaitlistData(
  searchValue?: string,
): Promise<WaitlistEntry[]> {
  await requireCapability("waitlist.manage", { mutation: true });
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
  await requireCapability("waitlist.manage", { mutation: true });
  return updateWaitlistStatusInternal(id, status, reason);
}

export async function autoApproveWaitlistEntry(id: string, reason?: string) {
  return updateWaitlistStatusInternal(id, "approved", reason);
}

async function updateWaitlistStatusInternal(
  id: string,
  status: "pending" | "approved" | "rejected",
  reason?: string,
) {
  const auth = await requireCapability("waitlist.manage", { mutation: true });
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

    let updatedWaitlist = waitlist;

    let warning: string | undefined;
    if (status === "approved" && (!waitlist.converted_to_user || waitlist.provisioning_user_id)) {
      const policy = await getPlatformOperationalPolicies();
      if (policy.security.allowAccountSetupLinks === false || policy.onboarding.setupEmailEnabled === false ||
          policy.notifications.onboardingSetupNotificationsEnabled === false) {
        throw new Error("Waitlist setup notifications are disabled by policy.");
      }
      const account = await provisionProduct(supabaseAdmin, auth.authUser.id, {
        email: waitlist.email, name: waitlist.name, role: "rider", status: "active",
        languagePreference: "en", isVerified: false, emailVerified: true, city: waitlist.city ?? undefined,
        country: waitlist.country_code ?? undefined, waitlistId: id, waitlistReason: reason,
      });
      warning = await notifyAccountSetup(supabaseAdmin, { ...account, domain: "rider" });
      updatedWaitlist = { ...waitlist, status: "approved", converted_to_user: true, provisioning_user_id: account.id };
    } else {
      const { data: nextWaitlist, error: updateError } = await supabase
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

      updatedWaitlist = nextWaitlist;
    }

    // Revalidate waitlist page to reflect changes
    revalidatePath("/waitlist");

    return { success: true, warning, data: updatedWaitlist };
  } catch (error) {
    console.error("Status update error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to update status",
    };
  }
}
