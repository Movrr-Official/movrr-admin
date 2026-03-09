"use server";

import { revalidatePath } from "next/cache";
import { Resend } from "resend";
import { ADMIN_ONLY_ROLES } from "@/lib/authPermissions";
import { requireAdminRoles } from "@/lib/admin";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { createSupabaseServerClient } from "@/supabase/server";
import { WaitlistEntry } from "@/types/types";
import AccountSetupEmail from "@/emails/account-setup";
import { APP_URL, FROM_EMAIL, RESEND_API_KEY } from "@/lib/env";
import { getPlatformOperationalPolicies } from "@/lib/platformSettings";
import { writeUserActivity } from "@/lib/userActivity";

// Utility function to generate a secure random password
function generateRandomPassword(length = 12) {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()";
  return Array.from(
    { length },
    () => chars[Math.floor(Math.random() * chars.length)],
  ).join("");
}

const getResendClient = () => {
  if (!RESEND_API_KEY) return null;
  return new Resend(RESEND_API_KEY);
};

const getSenderEmail = () =>
  FROM_EMAIL ? `Movrr <${FROM_EMAIL}>` : "Movrr <no-reply@movrr.nl>";

const getRecoveryRedirectUrl = () =>
  new URL("/auth/callback?next=/auth/reset-password", APP_URL).toString();

const delay = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

const waitForBootstrappedUserProfile = async (
  supabaseAdmin: ReturnType<typeof createSupabaseAdminClient>,
  userId: string,
  maxAttempts: number = 10,
): Promise<boolean> => {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const { data, error } = await supabaseAdmin
      .from("user")
      .select("id")
      .eq("id", userId)
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }

    if (data?.id) {
      return true;
    }

    await delay(150);
  }

  return false;
};

const cleanupCreatedUser = async (
  supabaseAdmin: ReturnType<typeof createSupabaseAdminClient>,
  userId: string,
) => {
  await supabaseAdmin.from("rider").delete().eq("user_id", userId);
  await supabaseAdmin.from("advertiser").delete().eq("user_id", userId);
  await supabaseAdmin.from("user").delete().eq("id", userId);
  await supabaseAdmin.auth.admin.deleteUser(userId);
};

export async function getWaitlistData(
  searchValue?: string,
): Promise<WaitlistEntry[]> {
  await requireAdminRoles(ADMIN_ONLY_ROLES);
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
  await requireAdminRoles(ADMIN_ONLY_ROLES);
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
  const auth = await requireAdminRoles(ADMIN_ONLY_ROLES);
  const supabaseAdmin = createSupabaseAdminClient(); // for Auth + RLS-safe insert
  const supabase = await createSupabaseServerClient(); // for fetching waitlist and updates

  try {
    let createdAuthUserId: string | null = null;
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

    // If approved and not yet converted → creates Auth user + public.user
    if (status === "approved" && !waitlist.converted_to_user) {
      // Create Supabase Auth user via Admin API
      const { data: authUser, error: authError } =
        await supabaseAdmin.auth.admin.createUser({
          email: waitlist.email,
          password: generateRandomPassword(),
          email_confirm: true, // mark email verified
          user_metadata: {
            full_name: waitlist.name,
            city: waitlist.city ?? undefined,
            server_assigned_role: "rider",
          },
        });

      if (authError || !authUser) {
        throw new Error(
          authError?.message || "Database error creating new Auth user",
        );
      }
      createdAuthUserId = authUser.user.id;

      const hasBootstrappedProfile = await waitForBootstrappedUserProfile(
        supabaseAdmin,
        authUser.user.id,
      );

      if (!hasBootstrappedProfile) {
        if (createdAuthUserId) {
          await cleanupCreatedUser(supabaseAdmin, createdAuthUserId);
        }
        throw new Error(
          "User bootstrap profile was not created by the auth trigger. Check the database trigger configuration.",
        );
      }

      const { error: profileError } = await supabaseAdmin.from("user").update({
        email: authUser.user.email,
        name: waitlist.name,
        role: "rider",
        status: "active",
        is_verified: false,
        email_verified: true,
        verification_level: "basic",
        updated_at: new Date().toISOString(),
      }).eq("id", authUser.user.id);

      if (profileError) {
        if (createdAuthUserId) {
          await cleanupCreatedUser(supabaseAdmin, createdAuthUserId);
        }
        throw new Error(profileError.message);
      }

      const policies = await getPlatformOperationalPolicies();
      const allowAccountSetupLinks =
        policies.security.allowAccountSetupLinks !== false;
      const setupEmailEnabled = policies.onboarding.setupEmailEnabled !== false;
      const setupNotificationsEnabled =
        policies.notifications.onboardingSetupNotificationsEnabled !== false;

      if (!allowAccountSetupLinks || !setupEmailEnabled || !setupNotificationsEnabled) {
        if (createdAuthUserId) {
          await cleanupCreatedUser(supabaseAdmin, createdAuthUserId);
        }
        throw new Error(
          !allowAccountSetupLinks
            ? "Account setup links are disabled by the current security policy."
            : !setupEmailEnabled
              ? "Waitlist approval setup emails are disabled by the onboarding policy."
              : "Onboarding setup notifications are disabled by the notification policy.",
        );
      }

      const { data: recoveryData, error: recoveryError } =
        await supabaseAdmin.auth.admin.generateLink({
          type: "recovery",
          email: waitlist.email,
          options: {
            redirectTo: getRecoveryRedirectUrl(),
          },
        });

      if (recoveryError || !recoveryData?.properties?.action_link) {
        if (createdAuthUserId) {
          await cleanupCreatedUser(supabaseAdmin, createdAuthUserId);
        }
        throw new Error(
          recoveryError?.message ||
            "Failed to generate rider account setup link",
        );
      }

      const resend = getResendClient();
      if (!resend) {
        if (createdAuthUserId) {
          await cleanupCreatedUser(supabaseAdmin, createdAuthUserId);
        }
        throw new Error(
          "RESEND_API_KEY is not configured; cannot send rider setup email",
        );
      }

      const { error: emailError } = await resend.emails.send({
        from: getSenderEmail(),
        to: waitlist.email,
        subject: "Set up your Movrr account",
        react: AccountSetupEmail({
          name: waitlist.name,
          setupUrl: recoveryData.properties.action_link,
        }),
      });

      if (emailError) {
        if (createdAuthUserId) {
          await cleanupCreatedUser(supabaseAdmin, createdAuthUserId);
        }
        throw new Error(
          `Failed to send rider setup email. ${emailError.message || ""}`.trim(),
        );
      }

      const { data: finalizedWaitlist, error: waitlistConvertedError } =
        await supabase
        .from("waitlist")
        .update({
          status: "approved",
          status_reason: reason,
          converted_to_user: true,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .select()
        .single();

      if (waitlistConvertedError) {
        throw new Error(waitlistConvertedError.message);
      }

      updatedWaitlist = finalizedWaitlist;

      await writeUserActivity(supabaseAdmin, {
        user_id: authUser.user.id,
        actor_user_id: auth.authUser.id,
        source: "waitlist",
        action: "Waitlist approved",
        description: "Waitlist entry was approved and converted into a rider account.",
        related_entity_type: "waitlist",
        related_entity_id: id,
        metadata: {
          waitlistId: id,
          reason: reason ?? null,
        },
      }).catch((activityError) => {
        console.warn("Waitlist approval activity write failed:", activityError);
      });
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

    return { success: true, data: updatedWaitlist };
  } catch (error) {
    console.error("Status update error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to update status",
    };
  }
}
