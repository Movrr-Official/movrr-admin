"use server";

import { revalidatePath } from "next/cache";
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
import UserWelcomeEmail from "@/emails/user-welcome";
import PasswordResetEmail from "@/emails/password-reset";

const mapUiRoleToDb = (role: string) => {
  if (role === "super-admin") return "super_admin";
  return role;
};

const mapDbRoleToUi = (role: string | null | undefined) => {
  if (!role) return "rider";
  if (role === "super_admin") return "super-admin";
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
});

const updateUserSchema = z.object({
  id: z.string(),
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  role: z
    .enum([
      "admin",
      "super-admin",
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
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;
  return new Resend(apiKey);
};

const getSenderEmail = () =>
  process.env.FROM_EMAIL || "Movrr <no-reply@movrr.nl>";

/**
 * Server action to fetch users for the dashboard.
 */
export async function getUsers(
  filters?: UserFiltersSchema,
  selectedAdvertiserIds: string[] = [],
): Promise<{ success: boolean; data?: User[]; error?: string }> {
  try {
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

    let users = (data ?? []).map((row) => ({
      id: row.id,
      email: row.email,
      name: row.name,
      phone: row.phone ?? undefined,
      role: mapDbRoleToUi(row.role),
      status: mapDbStatusToUi(row.status),
      createdAt: row.created_at ?? new Date().toISOString(),
      updatedAt: row.updated_at ?? new Date().toISOString(),
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
    const supabaseAdmin = createSupabaseAdminClient();
    const validatedData = createUserSchema.parse(data);

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
          name: validatedData.name,
          role: validatedData.role,
        },
      });

    if (authError || !authUser) {
      console.error("Create user auth error:", authError);
      return {
        success: false,
        error: authError?.message || "Failed to create authentication user",
      };
    }

    // Insert into public.user with the correct ID (matches auth.users)
    const userData: Record<string, any> = {
      id: authUser.user.id,
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
      .insert(userData)
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

    // Send welcome email if requested
    if (validatedData.sendWelcomeEmail) {
      try {
        const resend = getResendClient();
        if (!resend) {
          console.warn(
            "RESEND_API_KEY is not configured; skipping welcome email.",
          );
        } else {
          const dashboardUrl =
            process.env.NEXT_PUBLIC_APP_URL || "https://admin.movrr.nl";
          await resend.emails.send({
            from: getSenderEmail(),
            to: validatedData.email,
            subject: "Welcome to Movrr Admin",
            react: UserWelcomeEmail({
              name: validatedData.name,
              role: validatedData.role,
              dashboardUrl,
            }),
          });
        }
      } catch (emailError) {
        console.error("Welcome email failed:", emailError);
      }
    }

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
    const supabaseAdmin = createSupabaseAdminClient();

    const { data, error } = await supabaseAdmin.auth.admin.generateLink({
      type: "recovery",
      email,
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
    const exportData = {
      exportedAt: new Date().toISOString(),
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
    const supabaseAdmin = createSupabaseAdminClient();
    const validatedData = deleteUserSchema.parse(data);

    const userId = validatedData.userId;

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
  limit: number = 50,
): Promise<{ success: boolean; error?: string; data?: any[] }> {
  try {
    const supabaseAdmin = createSupabaseAdminClient();

    const { data, error } = await supabaseAdmin
      .from("admin_access_logs")
      .select("*")
      .or(`user_id.eq.${userId}`)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      console.error("Get user activity logs error:", error);
      return { success: false, error: error.message };
    }

    return { success: true, data: data || [] };
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
