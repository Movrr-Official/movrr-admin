"use server";

import { z } from "zod";
import {
  sendUserConfirmationEmail,
  sendAdminNotificationEmail,
} from "@/lib/email";
import { getPublicOnboardingSettings } from "@/app/actions/settings";
import { autoApproveWaitlistEntry } from "@/app/actions/waitlist";
import { getPlatformOperationalPolicies } from "@/lib/platformSettings";
import { createSupabaseServerClient } from "@/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

const resolveOperationalAlertRoles = (
  alertRouting: "support_only" | "support_and_admin" | "admin_only",
) => {
  switch (alertRouting) {
    case "support_only":
      return ["support"];
    case "admin_only":
      return ["admin", "super_admin"];
    default:
      return ["support", "admin", "super_admin"];
  }
};

const waitlistSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Please enter a valid email address"),
  city: z.string().min(2, "City must be at least 2 characters"),
  bikeOwnership: z.enum(["yes", "no", "planning"], {
    required_error: "Please select an option",
  }),
});

export type WaitlistFormData = z.infer<typeof waitlistSchema>;

export async function submitWaitlistForm(data: WaitlistFormData) {
  try {
    const [onboarding, policies] = await Promise.all([
      getPublicOnboardingSettings(),
      getPlatformOperationalPolicies(),
    ]);
    if (!onboarding.success || !onboarding.data) {
      throw new Error(onboarding.error || "Failed to load onboarding policy");
    }

    if (onboarding.data.riderOnboardingMode === "closed") {
      return {
        success: false,
        message:
          "Rider onboarding is currently closed. Contact Movrr support for assistance.",
      };
    }

    // Validate the data
    const validatedData = waitlistSchema.parse(data);

    const supabase = await createSupabaseServerClient();

    const insertPayload = {
      name: validatedData.name,
      email: validatedData.email,
      city: validatedData.city,
      bike_ownership: validatedData.bikeOwnership,
      status: "pending",
    };

    const { data: insertedWaitlist, error: dbError } = await supabase
      .from("waitlist")
      .insert(insertPayload)
      .select("id")
      .single();

    if (dbError) throw new Error(`Database Error: ${dbError.message}`);

    if (!policies.onboarding.autoApproveWaitlist) {
      await sendUserConfirmationEmail(
        validatedData.email,
        validatedData.name,
        validatedData.city,
        validatedData.bikeOwnership,
      );
    }

    if (
      policies.notifications.operationsEmailEnabled &&
      policies.notifications.waitlistNotificationsEnabled
    ) {
      await sendAdminNotificationEmail(
        validatedData.name,
        validatedData.email,
        validatedData.city,
        validatedData.bikeOwnership,
      );

      const supabaseAdmin = createSupabaseAdminClient();
      const { data: recipients } = await supabaseAdmin
        .from("admin_users")
        .select("user_id")
        .in(
          "role",
          resolveOperationalAlertRoles(policies.notifications.alertRouting),
        );

      if (recipients?.length) {
        await supabaseAdmin.from("notifications").insert(
          recipients.map((recipient) => ({
            user_id: recipient.user_id,
            title: "New waitlist registration",
            message: `${validatedData.name} joined the waitlist from ${validatedData.city}.`,
            type: "system",
            is_read: false,
            metadata: {
              source: "waitlist_signup",
              email: validatedData.email,
            },
          })),
        );
      }
    }

    if (policies.onboarding.autoApproveWaitlist && insertedWaitlist?.id) {
      const autoApproveResult = await autoApproveWaitlistEntry(
        insertedWaitlist.id,
        "Automatically approved by onboarding policy",
      );

      if (!autoApproveResult.success) {
        throw new Error(
          autoApproveResult.error || "Failed to auto-approve waitlist entry",
        );
      }
    }

    // Simulate processing delay
    await new Promise((resolve) => setTimeout(resolve, 1000));

    return {
      success: true,
      message: policies.onboarding.autoApproveWaitlist
        ? "Successfully joined Movrr. Check your email to set up your account."
        : "Successfully joined the waitlist!",
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, errors: error.flatten().fieldErrors };
    }

    console.error("Waitlist submission error:", error);
    return {
      success: false,
      message: "Something went wrong. Please try again.",
    };
  }
}
