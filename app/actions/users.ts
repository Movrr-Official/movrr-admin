"use server";

import { revalidatePath } from "next/cache";
import { ADMIN_ONLY_ROLES } from "@/lib/authPermissions";
import { requireAdminRoles } from "@/lib/admin";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import {
  User,
  UserFiltersSchema,
  updateUserRoleSchema,
  toggleUserStatusSchema,
  userRoleSchema,
  userStatusSchema,
} from "@/schemas";
import { z } from "zod";
import { Resend } from "resend";
import AccountSetupEmail from "@/emails/account-setup";
import PasswordResetEmail from "@/emails/password-reset";
import { APP_URL, FROM_EMAIL, RESEND_API_KEY } from "@/lib/env";
import {
  getPlatformOperationalPolicies,
  getPlatformPrivacyPolicy,
  getPlatformSecurityPolicy,
  isInviteDomainAllowed,
} from "@/lib/platformSettings";
import {
  fetchLatestUserActivitySignalMap,
  resolveLatestIsoTimestamp,
} from "@/lib/activitySignals";
import {
  fetchUserActivityFeed,
  writeUserActivity,
  writeUserActivities,
} from "@/lib/userActivity";

const mapUiRoleToDb = (role: string) => {
  if (role === "super_admin") return "super_admin";
  return role;
};

const mapDbRoleToUi = (role: string | null | undefined) => {
  if (!role) return "rider";
  if (role === "super_admin") return "super_admin";
  return role;
};

const mapUiStatusToDb = (status: string) => {
  if (status === "inactive") return "suspended";
  return status;
};

const mapDbStatusToUi = (status: string | null | undefined) => {
  if (!status) return "active";
  if (status === "suspended") return "inactive";
  return status;
};

const createUserSchema = z.object({
  email: z.string().email("Invalid email address"),
  name: z.string().min(1, "Full name is required").max(100),
  phone: z.string().optional(),
  role: userRoleSchema,
  status: userStatusSchema.default("active"),
  organization: z.string().optional(),
  languagePreference: z.string().default("en"),
  isVerified: z.boolean().default(false),
  accountNotes: z.string().optional(),
  sendWelcomeEmail: z.boolean().default(true),
  city: z.string().optional(),
  country: z.string().optional(),
  allowAdvertiserBootstrap: z.boolean().optional(),
}).superRefine((value, ctx) => {
  if (value.role === "advertiser" && !value.allowAdvertiserBootstrap) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message:
        "Advertiser accounts must be created from the Advertisers module.",
      path: ["role"],
    });
  }
  if (value.role === "rider") {
    if (!value.city?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "City is required for rider accounts",
        path: ["city"],
      });
    }
    if (!value.country?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Country is required for rider accounts",
        path: ["country"],
      });
    }
  }
});

const updateUserSchema = z.object({
  id: z.string(),
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  role: z
    .enum([
      "admin",
      "super_admin",
      "moderator",
      "support",
      "advertiser",
      "rider",
      "government",
    ])
    .optional(),
  status: z.enum(["active", "inactive", "pending"]).optional(),
  organization: z.string().optional(),
  languagePreference: z.string().optional(),
  isVerified: z.boolean().optional(),
  accountNotes: z.string().optional(),
});

const deleteUserSchema = z.object({
  userId: z.string(),
});

const getResendClient = () => {
  const apiKey = RESEND_API_KEY;
  if (!apiKey) return null;
  return new Resend(apiKey);
};

const getSenderEmail = () =>
  FROM_EMAIL ? `Movrr <${FROM_EMAIL}>` : "Movrr <no-reply@movrr.nl>";

const getRecoveryRedirectUrl = () =>
  new URL("/auth/callback?next=/auth/reset-password", APP_URL).toString();

const delay = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

const ADMIN_ACCESS_ROLES = new Set([
  "super_admin",
  "admin",
  "moderator",
  "support",
]);

const syncAdminAccessRecord = async (
  supabaseAdmin: ReturnType<typeof createSupabaseAdminClient>,
  input: {
    userId: string;
    email: string;
    role?: string | null;
    createdBy?: string | null;
  },
) => {
  const normalizedRole = input.role ? mapUiRoleToDb(input.role) : undefined;
  const shouldHaveAdminAccess = Boolean(
    normalizedRole && ADMIN_ACCESS_ROLES.has(normalizedRole),
  );

  if (!shouldHaveAdminAccess) {
    const { error } = await supabaseAdmin
      .from("admin_users")
      .delete()
      .eq("user_id", input.userId);

    if (error) {
      throw new Error(error.message);
    }
    return;
  }

  const { error } = await supabaseAdmin.from("admin_users").upsert(
    {
      user_id: input.userId,
      email: input.email,
      role: normalizedRole,
      created_by: input.createdBy ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );

  if (error) {
    throw new Error(error.message);
  }
};

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

type UserActivityEntry = {
  id: string;
  action: string;
  description: string;
  created_at: string;
  source:
    | "admin_access"
    | "route"
    | "campaign"
    | "reward"
    | "account";
};

/**
 * Server action to fetch users for the dashboard.
 */
export async function getUsers(
  filters?: UserFiltersSchema,
  selectedAdvertiserIds: string[] = [],
): Promise<{ success: boolean; data?: User[]; error?: string }> {
  try {
    await requireAdminRoles(ADMIN_ONLY_ROLES);
    const supabaseAdmin = createSupabaseAdminClient();

    let query = supabaseAdmin.from("user").select("*");

    if (filters?.role) {
      query = query.eq("role", mapUiRoleToDb(filters.role));
    }

    if (filters?.status) {
      query = query.eq("status", mapUiStatusToDb(filters.status));
    }

    if (filters?.searchQuery) {
      const q = filters.searchQuery.trim();
      if (q) {
        query = query.or(`name.ilike.%${q}%,email.ilike.%${q}%`);
      }
    }

    if (filters?.dateRange?.from) {
      query = query.gte("created_at", filters.dateRange.from.toISOString());
    }

    if (filters?.dateRange?.to) {
      query = query.lte("created_at", filters.dateRange.to.toISOString());
    }

    const { data, error } = await query.order("created_at", {
      ascending: false,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    const userIds = (data ?? []).map((row) => row.id);
    const lastActivitySignalMap = await fetchLatestUserActivitySignalMap(
      supabaseAdmin,
      userIds,
    );

    let users = (data ?? []).map((row) => ({
      id: row.id,
      email: row.email,
      name: row.name,
      phone: row.phone ?? undefined,
      role: mapDbRoleToUi(row.role),
      status: mapDbStatusToUi(row.status),
      createdAt: row.created_at ?? new Date().toISOString(),
      updatedAt: row.updated_at ?? new Date().toISOString(),
      lastActive: resolveLatestIsoTimestamp(
        lastActivitySignalMap.get(row.id),
        row.last_active_at ?? undefined,
        row.last_login ?? undefined,
      ),
      lastLogin: row.last_login ?? undefined,
      avatarUrl: row.avatar_url ?? undefined,
      organization: row.organization ?? undefined,
      isVerified: Boolean(row.is_verified),
      languagePreference: row.language_preference ?? "en",
      accountNotes: row.account_notes ?? undefined,
    })) as User[];

    if (selectedAdvertiserIds.length > 0) {
      users = users.filter(
        (user) =>
          user.role !== "advertiser" || selectedAdvertiserIds.includes(user.id),
      );
    }

    return { success: true, data: users };
  } catch (error) {
    console.error("Get users error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to fetch users",
    };
  }
}

/**
 * Server action to create a new user
 */
export async function createUser(
  data: z.infer<typeof createUserSchema>,
): Promise<{ success: boolean; error?: string; data?: User }> {
  try {
    const auth = await requireAdminRoles(ADMIN_ONLY_ROLES);
    const supabaseAdmin = createSupabaseAdminClient();
    const validatedData = createUserSchema.parse(data);
    const policies = await getPlatformOperationalPolicies();

    if (
      !isInviteDomainAllowed(
        validatedData.email,
        policies.security.inviteDomainAllowlist,
      )
    ) {
      return {
        success: false,
        error:
          "This email domain is not allowed by the current invite domain policy.",
      };
    }

    // Generate a random password (user will need to reset it)
    const generateRandomPassword = () => {
      const chars =
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*";
      let password = "";
      for (let i = 0; i < 16; i++) {
        password += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      return password;
    };

    // Create Supabase Auth user via Admin API
    const { data: authUser, error: authError } =
      await supabaseAdmin.auth.admin.createUser({
        email: validatedData.email,
        password: generateRandomPassword(),
        email_confirm: validatedData.isVerified,
        user_metadata: {
          full_name: validatedData.name,
          phone: validatedData.phone?.trim() || undefined,
          city: validatedData.city?.trim() || undefined,
          country: validatedData.country?.trim() || undefined,
          companyName: validatedData.organization?.trim() || undefined,
          language: validatedData.languagePreference,
          server_assigned_role: mapUiRoleToDb(validatedData.role),
        },
      });

    if (authError || !authUser) {
      console.error("Create user auth error:", authError);
      return {
        success: false,
        error: authError?.message || "Failed to create authentication user",
      };
    }

    const hasBootstrappedProfile = await waitForBootstrappedUserProfile(
      supabaseAdmin,
      authUser.user.id,
    );

    if (!hasBootstrappedProfile) {
      await supabaseAdmin.auth.admin.deleteUser(authUser.user.id);
      return {
        success: false,
        error:
          "User bootstrap profile was not created by the auth trigger. Check the database trigger configuration.",
      };
    }

    const userData: Record<string, any> = {
      email: validatedData.email,
      name: validatedData.name,
      role: mapUiRoleToDb(validatedData.role),
      status: mapUiStatusToDb(validatedData.status),
      email_verified: validatedData.isVerified,
      is_verified: validatedData.isVerified,
      verification_level: "basic",
      language_preference: validatedData.languagePreference,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    if (validatedData.phone) userData.phone = validatedData.phone;
    if (validatedData.organization)
      userData.organization = validatedData.organization;
    if (validatedData.accountNotes)
      userData.account_notes = validatedData.accountNotes;

    const { data: user, error: profileError } = await supabaseAdmin
      .from("user")
      .update(userData)
      .eq("id", authUser.user.id)
      .select()
      .single();

    if (profileError) {
      console.error("Create user profile error:", profileError);
      // Try to clean up auth user if profile creation fails
      await supabaseAdmin.auth.admin.deleteUser(authUser.user.id);
      return {
        success: false,
        error: profileError.message,
      };
    }

    try {
      await syncAdminAccessRecord(supabaseAdmin, {
        userId: authUser.user.id,
        email: validatedData.email,
        role: validatedData.role,
        createdBy: auth.authUser.id,
      });
    } catch (adminAccessError) {
      console.error("Create user admin access sync error:", adminAccessError);
      await cleanupCreatedUser(supabaseAdmin, authUser.user.id);
      return {
        success: false,
        error:
          adminAccessError instanceof Error
            ? adminAccessError.message
            : "Failed to provision admin dashboard access",
      };
    }

    const allowAccountSetupLinks =
      policies.security.allowAccountSetupLinks !== false;
    const allowSetupNotifications =
      policies.notifications.onboardingSetupNotificationsEnabled !== false;

    // Admin-created accounts should receive a setup link, not rely on an unknown generated password.
    if (validatedData.sendWelcomeEmail) {
      try {
        if (!allowAccountSetupLinks) {
          throw new Error(
            "Account setup links are disabled by the current security policy.",
          );
        }

        if (!allowSetupNotifications) {
          throw new Error(
            "Account setup notifications are disabled by the current notification policy.",
          );
        }

        const resend = getResendClient();
        if (!resend) {
          console.warn(
            "RESEND_API_KEY is not configured; skipping account setup email.",
          );
        } else {
          const { data: recoveryData, error: recoveryError } =
            await supabaseAdmin.auth.admin.generateLink({
              type: "recovery",
              email: validatedData.email,
              options: {
                redirectTo: getRecoveryRedirectUrl(),
              },
            });

          if (recoveryError || !recoveryData?.properties?.action_link) {
            throw new Error(
              recoveryError?.message ||
                "Failed to generate account setup link",
            );
          }

          await resend.emails.send({
            from: getSenderEmail(),
            to: validatedData.email,
            subject: "Set up your Movrr account",
            react: AccountSetupEmail({
              name: validatedData.name,
              setupUrl: recoveryData.properties.action_link,
            }),
          });
        }
      } catch (emailError) {
        console.error("Account setup email failed:", emailError);
        await cleanupCreatedUser(supabaseAdmin, authUser.user.id);
        return {
          success: false,
          error:
            emailError instanceof Error
              ? emailError.message
              : "Failed to send account setup email",
        };
      }
    }

    await writeUserActivity(supabaseAdmin, {
      user_id: authUser.user.id,
      actor_user_id: auth.authUser.id,
      source: "account",
      action: "Account created",
      description: `Account created with role ${validatedData.role}.`,
      related_entity_type: "user",
      related_entity_id: authUser.user.id,
      metadata: {
        role: validatedData.role,
        status: validatedData.status,
        sendWelcomeEmail: validatedData.sendWelcomeEmail,
      },
    }).catch((activityError) => {
      console.warn("Create user activity write failed:", activityError);
    });

    revalidatePath("/users");
    return { success: true, data: user as unknown as User };
  } catch (error) {
    console.error("Create user error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to create user",
    };
  }
}

/**
 * Server action to update user information
 */
export async function updateUser(
  data: z.infer<typeof updateUserSchema>,
): Promise<{ success: boolean; error?: string }> {
  try {
    const auth = await requireAdminRoles(ADMIN_ONLY_ROLES);
    const supabaseAdmin = createSupabaseAdminClient();
    const validatedData = updateUserSchema.parse(data);

    const updateData: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    // Only include fields that are provided
    if (validatedData.name !== undefined) updateData.name = validatedData.name;
    if (validatedData.email !== undefined)
      updateData.email = validatedData.email;
    if (validatedData.phone !== undefined)
      updateData.phone = validatedData.phone;
    if (validatedData.role !== undefined)
      updateData.role = mapUiRoleToDb(validatedData.role);
    if (validatedData.status !== undefined)
      updateData.status = mapUiStatusToDb(validatedData.status);
    if (validatedData.organization !== undefined)
      updateData.organization = validatedData.organization;
    if (validatedData.languagePreference !== undefined)
      updateData.language_preference = validatedData.languagePreference;
    if (validatedData.isVerified !== undefined)
      updateData.is_verified = validatedData.isVerified;
    if (validatedData.accountNotes !== undefined)
      updateData.account_notes = validatedData.accountNotes;

    const { error } = await supabaseAdmin
      .from("user")
      .update(updateData)
      .eq("id", validatedData.id);

    if (error) {
      console.error("Update user error:", error);
      return { success: false, error: error.message };
    }

    const adminEmail =
      validatedData.email ??
      (
        await supabaseAdmin
          .from("user")
          .select("email, role")
          .eq("id", validatedData.id)
          .single()
      ).data?.email;
    const adminRole =
      validatedData.role ??
      mapDbRoleToUi(
        (
          await supabaseAdmin
            .from("user")
            .select("role")
            .eq("id", validatedData.id)
            .single()
        ).data?.role,
      );

    if (adminEmail) {
      try {
        await syncAdminAccessRecord(supabaseAdmin, {
          userId: validatedData.id,
          email: adminEmail,
          role: adminRole,
        });
      } catch (adminAccessError) {
        console.error("Update user admin access sync error:", adminAccessError);
        return {
          success: false,
          error:
            adminAccessError instanceof Error
              ? adminAccessError.message
              : "Failed to sync admin dashboard access",
        };
      }
    }

    await writeUserActivity(supabaseAdmin, {
      user_id: validatedData.id,
      actor_user_id: auth.authUser.id,
      source: "account",
      action: "Account updated",
      description: "User profile details were updated by an administrator.",
      related_entity_type: "user",
      related_entity_id: validatedData.id,
      metadata: {
        fields: Object.keys(updateData).filter((key) => key !== "updated_at"),
      },
    }).catch((activityError) => {
      console.warn("Update user activity write failed:", activityError);
    });

    revalidatePath("/users");
    return { success: true };
  } catch (error) {
    console.error("Update user error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to update user",
    };
  }
}

/**
 * Server action to update user role
 */
export async function updateUserRole(
  data: z.infer<typeof updateUserRoleSchema>,
): Promise<{ success: boolean; error?: string }> {
  try {
    const auth = await requireAdminRoles(ADMIN_ONLY_ROLES);
    const supabaseAdmin = createSupabaseAdminClient();
    const validatedData = updateUserRoleSchema.parse(data);

    const { error } = await supabaseAdmin
      .from("user")
      .update({
        role: mapUiRoleToDb(validatedData.role),
        updated_at: new Date().toISOString(),
      })
      .eq("id", validatedData.userId);

    if (error) {
      console.error("Update user role error:", error);
      return { success: false, error: error.message };
    }

    const { data: userRow, error: userLookupError } = await supabaseAdmin
      .from("user")
      .select("email")
      .eq("id", validatedData.userId)
      .single();

    if (userLookupError || !userRow?.email) {
      return {
        success: false,
        error: userLookupError?.message || "User email not found",
      };
    }

    try {
      await syncAdminAccessRecord(supabaseAdmin, {
        userId: validatedData.userId,
        email: userRow.email,
        role: validatedData.role,
      });
    } catch (adminAccessError) {
      console.error("Update user role admin access sync error:", adminAccessError);
      return {
        success: false,
        error:
          adminAccessError instanceof Error
            ? adminAccessError.message
            : "Failed to sync admin dashboard access",
      };
    }

    await writeUserActivity(supabaseAdmin, {
      user_id: validatedData.userId,
      actor_user_id: auth.authUser.id,
      source: "account",
      action: "Role updated",
      description: `User role changed to ${validatedData.role}.`,
      related_entity_type: "user",
      related_entity_id: validatedData.userId,
      metadata: { role: validatedData.role },
    }).catch((activityError) => {
      console.warn("Update user role activity write failed:", activityError);
    });

    revalidatePath("/users");
    return { success: true };
  } catch (error) {
    console.error("Update user role error:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to update user role",
    };
  }
}

/**
 * Server action to toggle user status
 */
export async function toggleUserStatus(
  data: z.infer<typeof toggleUserStatusSchema>,
): Promise<{ success: boolean; error?: string }> {
  try {
    const auth = await requireAdminRoles(ADMIN_ONLY_ROLES);
    const supabaseAdmin = createSupabaseAdminClient();
    const validatedData = toggleUserStatusSchema.parse(data);

    const { error } = await supabaseAdmin
      .from("user")
      .update({
        status: mapUiStatusToDb(validatedData.status),
        updated_at: new Date().toISOString(),
      })
      .eq("id", validatedData.userId);

    if (error) {
      console.error("Toggle user status error:", error);
      return { success: false, error: error.message };
    }

    if (validatedData.status !== "active") {
      const { error: adminAccessDeleteError } = await supabaseAdmin
        .from("admin_users")
        .delete()
        .eq("user_id", validatedData.userId);

      if (adminAccessDeleteError) {
        return { success: false, error: adminAccessDeleteError.message };
      }
    } else {
      const { data: userRow, error: userLookupError } = await supabaseAdmin
        .from("user")
        .select("email, role")
        .eq("id", validatedData.userId)
        .single();

      if (userLookupError || !userRow?.email) {
        return {
          success: false,
          error: userLookupError?.message || "User email not found",
        };
      }

      try {
        await syncAdminAccessRecord(supabaseAdmin, {
          userId: validatedData.userId,
          email: userRow.email,
          role: mapDbRoleToUi(userRow.role),
        });
      } catch (adminAccessError) {
        console.error("Toggle user status admin access sync error:", adminAccessError);
        return {
          success: false,
          error:
            adminAccessError instanceof Error
              ? adminAccessError.message
              : "Failed to sync admin dashboard access",
        };
      }
    }

    await writeUserActivity(supabaseAdmin, {
      user_id: validatedData.userId,
      actor_user_id: auth.authUser.id,
      source: "account",
      action: "Status updated",
      description: `User status changed to ${validatedData.status}.`,
      related_entity_type: "user",
      related_entity_id: validatedData.userId,
      metadata: { status: validatedData.status },
    }).catch((activityError) => {
      console.warn("Toggle user status activity write failed:", activityError);
    });

    revalidatePath("/users");
    return { success: true };
  } catch (error) {
    console.error("Toggle user status error:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to update user status",
    };
  }
}

/**
 * Server action to send password reset email
 */
export async function sendPasswordResetEmail(
  email: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const auth = await requireAdminRoles(ADMIN_ONLY_ROLES);
    const supabaseAdmin = createSupabaseAdminClient();
    const securityPolicy = await getPlatformSecurityPolicy();
    const allowPasswordResetLinks =
      securityPolicy.allowPasswordResetLinks !== false;

    if (!allowPasswordResetLinks) {
      return {
        success: false,
        error: "Password reset links are disabled by the current security policy.",
      };
    }

    const { data, error } = await supabaseAdmin.auth.admin.generateLink({
      type: "recovery",
      email,
      options: {
        redirectTo: getRecoveryRedirectUrl(),
      },
    });

    if (error) {
      console.error("Send password reset error:", error);
      return { success: false, error: error.message };
    }

    const resetLink = data?.properties?.action_link;
    if (!resetLink) {
      return { success: false, error: "Password reset link not generated" };
    }

    const resend = getResendClient();
    if (!resend) {
      return {
        success: false,
        error: "RESEND_API_KEY is not configured; cannot send email",
      };
    }

    const { data: profileRow } = await supabaseAdmin
      .from("user")
      .select("name")
      .eq("email", email)
      .maybeSingle();

    await resend.emails.send({
      from: getSenderEmail(),
      to: email,
      subject: "Reset your Movrr Admin password",
      react: PasswordResetEmail({
        name: profileRow?.name || "there",
        resetUrl: resetLink,
      }),
    });

    const { data: userRow } = await supabaseAdmin
      .from("user")
      .select("id")
      .eq("email", email)
      .maybeSingle();

    if (userRow?.id) {
      await writeUserActivity(supabaseAdmin, {
        user_id: userRow.id,
        actor_user_id: auth.authUser.id,
        source: "account",
        action: "Password reset sent",
        description: "A password reset or account setup email was sent.",
        related_entity_type: "user",
        related_entity_id: userRow.id,
        metadata: { email },
      }).catch((activityError) => {
        console.warn("Password reset activity write failed:", activityError);
      });
    }

    return { success: true };
  } catch (error) {
    console.error("Send password reset error:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to send password reset email",
    };
  }
}

/**
 * Server action to export user data (GDPR compliance)
 * Exports all user data including profile, routes, earnings, transactions, etc.
 */
export async function exportUserData(
  userId: string,
): Promise<{ success: boolean; error?: string; data?: any }> {
  try {
    await requireAdminRoles(ADMIN_ONLY_ROLES);
    const supabaseAdmin = createSupabaseAdminClient();

    // Fetch user profile
    const { data: user, error: userError } = await supabaseAdmin
      .from("user")
      .select("*")
      .eq("id", userId)
      .single();

    if (userError || !user) {
      return { success: false, error: "User not found" };
    }

    // Fetch auth user data
    const { data: authUser } =
      await supabaseAdmin.auth.admin.getUserById(userId);

    const { data: rider } = await supabaseAdmin
      .from("rider")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();

    const riderId = rider?.id ?? null;

    // Fetch routes (if user is a rider)
    const { data: routes } = riderId
      ? await supabaseAdmin
          .from("rider_route")
          .select("*")
          .eq("rider_id", riderId)
      : { data: [] };

    // Fetch campaign assignments (if user is a rider)
    const { data: campaignAssignments } = riderId
      ? await supabaseAdmin
          .from("campaign_assignment")
          .select("*")
          .eq("rider_id", riderId)
      : { data: [] };

    // Fetch campaign signups (if user is a rider)
    const { data: campaignSignups } = riderId
      ? await supabaseAdmin
          .from("campaign_signup")
          .select("*")
          .eq("rider_id", riderId)
      : { data: [] };

    // Fetch reward transactions
    const { data: rewardTransactions } = riderId
      ? await supabaseAdmin
          .from("reward_transactions")
          .select("*")
          .eq("rider_id", riderId)
          .order("created_at", { ascending: false })
      : { data: [] };

    // Fetch reward balance
    const { data: rewardBalance } = riderId
      ? await supabaseAdmin
          .from("rider_reward_balance")
          .select("*")
          .eq("rider_id", riderId)
          .single()
      : { data: null };

    // Fetch audit logs for this user
    const { data: auditLogs } = await supabaseAdmin
      .from("admin_access_logs")
      .select("*")
      .or(`user_id.eq.${userId},email.eq.${user?.email}`)
      .order("created_at", { ascending: false })
      .limit(100);

    // Compile all data
    const privacyPolicy = await getPlatformPrivacyPolicy();
    const exportData = {
      exportedAt: new Date().toISOString(),
      privacyPolicy: {
        privacyContactEmail: privacyPolicy.privacyContactEmail,
        deletionPolicyText: privacyPolicy.deletionPolicyText,
        exportRequestResponseHours: privacyPolicy.exportRequestResponseHours,
      },
      user: {
        profile: user,
        auth: authUser?.user
          ? {
              email: authUser.user.email,
              emailConfirmed: authUser.user.email_confirmed_at,
              lastSignIn: authUser.user.last_sign_in_at,
              createdAt: authUser.user.created_at,
            }
          : null,
      },
      routes: routes || [],
      campaignAssignments: campaignAssignments || [],
      campaignSignups: campaignSignups || [],
      rewardTransactions: rewardTransactions || [],
      rewardBalance: rewardBalance || null,
      auditLogs: auditLogs || [],
    };

    return { success: true, data: exportData };
  } catch (error) {
    console.error("Export user data error:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to export user data",
    };
  }
}

/**
 * Server action to delete a user and related records.
 */
export async function deleteUser(
  data: z.infer<typeof deleteUserSchema>,
): Promise<{ success: boolean; error?: string }> {
  try {
    const auth = await requireAdminRoles(ADMIN_ONLY_ROLES);
    const supabaseAdmin = createSupabaseAdminClient();
    const validatedData = deleteUserSchema.parse(data);

    const userId = validatedData.userId;
    const { data: targetUser } = await supabaseAdmin
      .from("user")
      .select("id, name, email")
      .eq("id", userId)
      .maybeSingle();

    const { data: rider } = await supabaseAdmin
      .from("rider")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();

    if (rider?.id) {
      const riderId = rider.id as string;

      await supabaseAdmin
        .from("impression_events")
        .delete()
        .eq("rider_id", riderId);
      await supabaseAdmin
        .from("campaign_assignment_events")
        .delete()
        .eq("rider_id", riderId);
      await supabaseAdmin
        .from("campaign_assignment")
        .delete()
        .eq("rider_id", riderId);
      await supabaseAdmin
        .from("campaign_signup")
        .delete()
        .eq("rider_id", riderId);
      await supabaseAdmin
        .from("performance_stats")
        .delete()
        .eq("rider_id", riderId);
      await supabaseAdmin
        .from("reward_redemptions")
        .delete()
        .eq("rider_id", riderId);
      await supabaseAdmin
        .from("reward_transactions")
        .delete()
        .eq("rider_id", riderId);
      await supabaseAdmin
        .from("rider_reward_balance")
        .delete()
        .eq("rider_id", riderId);
      await supabaseAdmin
        .from("rider_campaign_streak")
        .delete()
        .eq("rider_id", riderId);
      await supabaseAdmin
        .from("rider_availability_log")
        .delete()
        .eq("rider_id", riderId);
      await supabaseAdmin.from("rider_bikes").delete().eq("rider_id", riderId);
      await supabaseAdmin.from("rider_route").delete().eq("rider_id", riderId);
      await supabaseAdmin
        .from("route_tracking")
        .delete()
        .eq("rider_id", riderId);
      await supabaseAdmin.from("rider").delete().eq("id", riderId);
    }

    const { data: advertiser } = await supabaseAdmin
      .from("advertiser")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();

    if (advertiser?.id) {
      const { count: campaignCount } = await supabaseAdmin
        .from("campaign")
        .select("id", { count: "exact", head: true })
        .eq("advertiser_id", advertiser.id);

      if ((campaignCount ?? 0) > 0) {
        return {
          success: false,
          error:
            "Cannot delete advertiser with existing campaigns. Reassign or archive campaigns first.",
        };
      }

      await supabaseAdmin.from("advertiser").delete().eq("id", advertiser.id);
    }

    await supabaseAdmin.from("admin_users").delete().eq("user_id", userId);
    await writeUserActivity(supabaseAdmin, {
      user_id: userId,
      actor_user_id: auth.authUser.id,
      source: "account",
      action: "Account deleted",
      description: `Account ${targetUser?.email ?? userId} was deleted by an administrator.`,
      related_entity_type: "user",
      related_entity_id: userId,
      metadata: { name: targetUser?.name ?? null, email: targetUser?.email ?? null },
    }).catch((activityError) => {
      console.warn("Delete user activity write failed:", activityError);
    });
    await supabaseAdmin.from("user").delete().eq("id", userId);
    await supabaseAdmin.auth.admin.deleteUser(userId);

    revalidatePath("/users");
    return { success: true };
  } catch (error) {
    console.error("Delete user error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to delete user",
    };
  }
}

/**
 * Server action to bulk update user status
 */
export async function bulkUpdateUserStatus(
  userIds: string[],
  status: "active" | "inactive" | "pending",
): Promise<{ success: boolean; error?: string; updatedCount?: number }> {
  try {
    await requireAdminRoles(ADMIN_ONLY_ROLES);
    const supabaseAdmin = createSupabaseAdminClient();

    const { data, error } = await supabaseAdmin
      .from("user")
      .update({
        status: mapUiStatusToDb(status),
        updated_at: new Date().toISOString(),
      })
      .in("id", userIds)
      .select();

    if (error) {
      console.error("Bulk update user status error:", error);
      return { success: false, error: error.message };
    }

    return { success: true, updatedCount: data?.length || 0 };
  } catch (error) {
    console.error("Bulk update user status error:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to bulk update user status",
    };
  }
}

/**
 * Server action to get user activity logs
 */
export async function getUserActivityLogs(
  userId: string,
  limit: number = 12,
): Promise<{ success: boolean; error?: string; data?: any[] }> {
  try {
    await requireAdminRoles(ADMIN_ONLY_ROLES);
    const supabaseAdmin = createSupabaseAdminClient();
    const canonicalFeed = await fetchUserActivityFeed(supabaseAdmin, userId, limit);
    if (canonicalFeed.available && canonicalFeed.data.length > 0) {
      return { success: true, data: canonicalFeed.data };
    }

    const { data: profile } = await supabaseAdmin
      .from("user")
      .select("id, email, created_at, updated_at, last_login, last_active_at")
      .eq("id", userId)
      .maybeSingle();

    if (!profile) {
      return { success: true, data: [] };
    }

    const { data: rider } = await supabaseAdmin
      .from("rider")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();

    const riderId = rider?.id ?? null;

    const [
      adminAccessResult,
      routeResult,
      rewardResult,
      campaignAssignmentResult,
      campaignSignupResult,
    ] = await Promise.all([
      supabaseAdmin
        .from("admin_access_logs")
        .select("id, action, success, created_at")
        .or(`user_id.eq.${userId},email.eq.${profile.email}`)
        .eq("success", true)
        .order("created_at", { ascending: false })
        .limit(5),
      riderId
        ? supabaseAdmin
            .from("rider_route")
            .select("id, route_id, assigned_at, completed_at, created_at")
            .eq("rider_id", riderId)
            .order("created_at", { ascending: false })
            .limit(10)
        : Promise.resolve({ data: [], error: null }),
      riderId
        ? supabaseAdmin
            .from("reward_transactions")
            .select("id, type, description, created_at, points_amount")
            .eq("rider_id", riderId)
            .order("created_at", { ascending: false })
            .limit(10)
        : Promise.resolve({ data: [], error: null }),
      riderId
        ? supabaseAdmin
            .from("campaign_assignment")
            .select("id, campaign_id, created_at, assigned_at, selected_at, confirmed_at")
            .eq("rider_id", riderId)
            .order("created_at", { ascending: false })
            .limit(10)
        : Promise.resolve({ data: [], error: null }),
      riderId
        ? supabaseAdmin
            .from("campaign_signup")
            .select("id, campaign_id, created_at")
            .eq("rider_id", riderId)
            .order("created_at", { ascending: false })
            .limit(10)
        : Promise.resolve({ data: [], error: null }),
    ]);

    const errors = [
      adminAccessResult.error,
      routeResult.error,
      rewardResult.error,
      campaignAssignmentResult.error,
      campaignSignupResult.error,
    ].filter(Boolean);

    if (errors.length > 0) {
      console.error("Get user activity logs error:", errors[0]);
      return {
        success: false,
        error:
          errors[0] instanceof Error
            ? errors[0].message
            : "Failed to get user activity logs",
      };
    }

    const entries: UserActivityEntry[] = [];

    if (profile.created_at) {
      entries.push({
        id: `account-created-${profile.id}`,
        action: "Account created",
        description: "User account was created in MOVRR Admin.",
        created_at: profile.created_at,
        source: "account",
      });
    }

    if (profile.updated_at && profile.updated_at !== profile.created_at) {
      entries.push({
        id: `account-updated-${profile.id}`,
        action: "Account updated",
        description: "User profile details were updated.",
        created_at: profile.updated_at,
        source: "account",
      });
    }

    (adminAccessResult.data ?? []).forEach((log) => {
      entries.push({
        id: `admin-access-${log.id}`,
        action: "Admin dashboard access",
        description: "User successfully accessed the admin dashboard.",
        created_at: log.created_at,
        source: "admin_access",
      });
    });

    (routeResult.data ?? []).forEach((route) => {
      if (route.completed_at) {
        entries.push({
          id: `route-completed-${route.id}`,
          action: "Route completed",
          description: `Completed route ${route.route_id ?? "assignment"}.`,
          created_at: route.completed_at,
          source: "route",
        });
      } else if (route.assigned_at || route.created_at) {
        entries.push({
          id: `route-assigned-${route.id}`,
          action: "Route assigned",
          description: `Assigned to route ${route.route_id ?? "assignment"}.`,
          created_at: route.assigned_at ?? route.created_at,
          source: "route",
        });
      }
    });

    (campaignAssignmentResult.data ?? []).forEach((assignment) => {
      const timestamp =
        assignment.confirmed_at ??
        assignment.selected_at ??
        assignment.assigned_at ??
        assignment.created_at;

      if (!timestamp) return;

      entries.push({
        id: `campaign-assignment-${assignment.id}`,
        action: assignment.confirmed_at
          ? "Campaign confirmed"
          : assignment.selected_at
            ? "Campaign selected"
            : "Campaign assigned",
        description: `Campaign ${assignment.campaign_id ?? "assignment"} progressed in the rider workflow.`,
        created_at: timestamp,
        source: "campaign",
      });
    });

    (campaignSignupResult.data ?? []).forEach((signup) => {
      if (!signup.created_at) return;
      entries.push({
        id: `campaign-signup-${signup.id}`,
        action: "Campaign signup",
        description: `Signed up for campaign ${signup.campaign_id ?? "campaign"}.`,
        created_at: signup.created_at,
        source: "campaign",
      });
    });

    (rewardResult.data ?? []).forEach((transaction) => {
      if (!transaction.created_at) return;
      const amount = Number(transaction.points_amount ?? 0);
      entries.push({
        id: `reward-${transaction.id}`,
        action: amount >= 0 ? "Points awarded" : "Points redeemed",
        description:
          transaction.description ||
          `${amount >= 0 ? "Awarded" : "Redeemed"} ${Math.abs(amount)} points.`,
        created_at: transaction.created_at,
        source: "reward",
      });
    });

    const curatedEntries = entries
      .sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      )
      .filter(
        (entry, index, collection) =>
          collection.findIndex(
            (candidate) =>
              candidate.action === entry.action &&
              candidate.created_at === entry.created_at &&
              candidate.description === entry.description,
          ) === index,
      )
      .slice(0, limit);

    return { success: true, data: curatedEntries };
  } catch (error) {
    console.error("Get user activity logs error:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to get user activity logs",
    };
  }
}

/**
 * Server action to get user routes
 */
export async function getUserRoutes(
  userId: string,
): Promise<{ success: boolean; error?: string; data?: any[] }> {
  try {
    await requireAdminRoles(ADMIN_ONLY_ROLES);
    const supabaseAdmin = createSupabaseAdminClient();

    const { data: rider } = await supabaseAdmin
      .from("rider")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();

    if (!rider?.id) {
      return { success: true, data: [] };
    }

    const { data, error } = await supabaseAdmin
      .from("rider_route")
      .select("*")
      .eq("rider_id", rider.id)
      .order("assigned_at", { ascending: false });

    if (error) {
      console.error("Get user routes error:", error);
      return { success: false, error: error.message };
    }

    return { success: true, data: data || [] };
  } catch (error) {
    console.error("Get user routes error:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to get user routes",
    };
  }
}

/**
 * Server action to get user campaigns
 */
export async function getUserCampaigns(
  userId: string,
): Promise<{ success: boolean; error?: string; data?: any[] }> {
  try {
    await requireAdminRoles(ADMIN_ONLY_ROLES);
    const supabaseAdmin = createSupabaseAdminClient();

    const { data: rider } = await supabaseAdmin
      .from("rider")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();

    if (!rider?.id) {
      return { success: true, data: [] };
    }

    // Get campaigns where user is assigned or signed up
    const { data: assignments } = await supabaseAdmin
      .from("campaign_assignment")
      .select("campaign_id")
      .eq("rider_id", rider.id);

    const { data: signups } = await supabaseAdmin
      .from("campaign_signup")
      .select("campaign_id")
      .eq("rider_id", rider.id);

    const campaignIds = [
      ...(assignments?.map((a) => a.campaign_id) || []),
      ...(signups?.map((s) => s.campaign_id) || []),
    ].filter((id, index, self) => self.indexOf(id) === index); // Remove duplicates

    if (campaignIds.length === 0) {
      return { success: true, data: [] };
    }

    const { data: campaigns, error } = await supabaseAdmin
      .from("campaign")
      .select("*")
      .in("id", campaignIds)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Get user campaigns error:", error);
      return { success: false, error: error.message };
    }

    return { success: true, data: campaigns || [] };
  } catch (error) {
    console.error("Get user campaigns error:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to get user campaigns",
    };
  }
}

/**
 * Server action to get user reward transactions
 */
export async function getUserRewardTransactions(
  userId: string,
  limit: number = 50,
): Promise<{ success: boolean; error?: string; data?: any[] }> {
  try {
    await requireAdminRoles(ADMIN_ONLY_ROLES);
    const supabaseAdmin = createSupabaseAdminClient();

    const { data: rider } = await supabaseAdmin
      .from("rider")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();

    if (!rider?.id) {
      return { success: true, data: [] };
    }

    const { data, error } = await supabaseAdmin
      .from("reward_transactions")
      .select("*")
      .eq("rider_id", rider.id)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      console.error("Get user reward transactions error:", error);
      return { success: false, error: error.message };
    }

    return { success: true, data: data || [] };
  } catch (error) {
    console.error("Get user reward transactions error:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to get user reward transactions",
    };
  }
}

/**
 * Server action to get user points balance
 */
export async function getUserPointsBalance(
  userId: string,
): Promise<{ success: boolean; error?: string; data?: any }> {
  try {
    await requireAdminRoles(ADMIN_ONLY_ROLES);
    const supabaseAdmin = createSupabaseAdminClient();

    const { data: rider } = await supabaseAdmin
      .from("rider")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();

    if (!rider?.id) {
      return { success: true, data: null };
    }

    const { data, error } = await supabaseAdmin
      .from("rider_reward_balance")
      .select("*")
      .eq("rider_id", rider.id)
      .single();

    if (error && error.code !== "PGRST116") {
      // PGRST116 = not found, which is OK
      console.error("Get user points balance error:", error);
      return { success: false, error: error.message };
    }

    return { success: true, data: data || null };
  } catch (error) {
    console.error("Get user points balance error:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to get user points balance",
    };
  }
}

