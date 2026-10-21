"use server";

import { provisionProduct, advertiserProvisioningSchema } from "@/features/identity/application/productProvisioning";
import { notifyAccountSetup } from "@/lib/services/accountSetupNotification";
import { provisionEmployee } from "@/features/identity/application/employeeProvisioning";
import { isEmployeeRole } from "@/features/organisations/domain/employeeRoleTemplates";
import {
  capabilityRequiredToAssignRole,
} from "@/features/authorization/sod";

import { revalidatePath } from "next/cache";
import { requireCapability, requireAnyCapability } from "@/lib/admin";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import {
  User,
  UserFiltersSchema,
  updateUserRoleSchema,
  toggleUserStatusSchema,
  userRoleSchema,
  employeeRoleSchema,
  accountCreationRoleSchema,
  userStatusSchema,
  RewardTransaction,
} from "@/schemas";
import {
  DB_TABLES,
  REWARD_SOURCE,
  parseRewardMetadata,
} from "@/lib/rewardConstants";
import { z } from "zod";
import { Resend } from "resend";
import PasswordResetEmail, { passwordResetText } from "@/emails/password-reset";
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
import { ADMIN_DASHBOARD_SESSION_AUDIT_ACTION } from "@/lib/adminAccessMonitoring";
import {
  fetchUserActivityFeed,
  writeUserActivity,
} from "@/lib/userActivity";

const mapUiStatusToDb = (status: string) => {
  if (status === "inactive") return "suspended";
  return status;
};

const mapDbStatusToUi = (status: string | null | undefined) => {
  if (!status) return "active";
  if (status === "suspended") return "inactive";
  return status;
};

const createUserSchema = z
  .object({
    email: z.string().email("Invalid email address"),
    name: z.string().min(1, "Full name is required").max(100),
    phone: z.string().optional(),
    role: accountCreationRoleSchema,
    status: userStatusSchema.default("active"),
    organization: z.string().optional(),
    languagePreference: z.string().default("en"),
    isVerified: z.boolean().default(false),
    accountNotes: z.string().optional(),
    sendWelcomeEmail: z.boolean().default(true),
    city: z.string().optional(),
    country: z.string().optional(),
    allowAdvertiserBootstrap: z.boolean().optional(),
    advertiserProfile: advertiserProvisioningSchema.optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
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
  employeeRole: employeeRoleSchema.nullable().optional(),
  status: z.enum(["active", "inactive", "pending"]).optional(),
  organization: z.string().optional(),
  languagePreference: z.string().optional(),
  isVerified: z.boolean().optional(),
  accountNotes: z.string().optional(),
}).strict();

const deleteUserSchema = z.object({
  userId: z.string(),
});

const getResendClient = () => {
  const apiKey = RESEND_API_KEY;
  if (!apiKey) return null;
  return new Resend(apiKey);
};

const getSenderEmail = () =>
  FROM_EMAIL ? `MOVRR <${FROM_EMAIL}>` : "MOVRR <no-reply@movrr.nl>";

const getRecoveryRedirectUrl = () =>
  new URL("/auth/callback?next=/auth/reset-password", APP_URL).toString();

/**
 * Build the scanner-safe confirm URL for outbound emails.
 * Uses token_hash (from generateLink) instead of action_link so the token
 * is only consumed after the user explicitly clicks "Continue" on /auth/confirm.
 */
const buildConfirmUrl = (hashedToken: string, type: string): string => {
  const url = new URL("/auth/confirm", APP_URL);
  url.searchParams.set("token_hash", hashedToken);
  url.searchParams.set("type", type);
  return url.toString();
};

type UserActivityEntry = {
  id: string;
  action: string;
  description: string;
  created_at: string;
  source: "admin_access" | "route" | "campaign" | "reward" | "account";
};

type UserAuditExportLog = {
  id: string;
  action: string;
  result?: string;
  timestamp: string;
  source_ip?: string;
  user_agent?: string;
  resource_id?: string;
  metadata?: Record<string, unknown>;
  performed_by: {
    id: string;
    name: string;
    email: string;
    role: string;
  };
  affected_entity?: {
    type: string;
    id: string;
    name: string;
  };
};

const normalizeUserAuditExportLog = (
  row: Record<string, unknown>,
): UserAuditExportLog | null => {
  const timestamp =
    typeof row.timestamp === "string"
      ? row.timestamp
      : typeof row.created_at === "string"
        ? row.created_at
        : undefined;

  if (!timestamp) {
    return null;
  }

  const performedBy = (row.performed_by as
    | UserAuditExportLog["performed_by"]
    | undefined) ??
    (row.performedBy as UserAuditExportLog["performed_by"] | undefined) ?? {
      id: String(row.performed_by_id ?? row.performedById ?? ""),
      name: String(row.performed_by_name ?? row.performedByName ?? "System"),
      email: String(
        row.performed_by_email ?? row.performedByEmail ?? "system@movrr.local",
      ),
      role: String(row.performed_by_role ?? row.performedByRole ?? "system"),
    };

  const affectedEntity =
    (row.affected_entity as
      | UserAuditExportLog["affected_entity"]
      | undefined) ??
    (row.affectedEntity as UserAuditExportLog["affected_entity"] | undefined) ??
    undefined;

  return {
    id: String(row.id ?? crypto.randomUUID()),
    action: String(row.action ?? "Audit event"),
    result:
      typeof row.result === "string"
        ? row.result.charAt(0).toUpperCase() + row.result.slice(1).toLowerCase()
        : undefined,
    timestamp,
    source_ip: (row.source_ip ?? row.sourceIp) as string | undefined,
    user_agent: (row.user_agent ?? row.userAgent) as string | undefined,
    resource_id: (row.resource_id ?? row.resourceId) as string | undefined,
    metadata: (row.metadata as Record<string, unknown> | undefined) ?? {},
    performed_by: performedBy,
    affected_entity: affectedEntity,
  };
};

const fetchAdminSessionAuditLogs = async (
  supabaseAdmin: ReturnType<typeof createSupabaseAdminClient>,
  userId: string,
  limit: number,
): Promise<{ data: UserAuditExportLog[]; error?: string }> => {
  const tryFetch = async (tableName: string, resourceField: string) =>
    supabaseAdmin
      .from(tableName)
      .select("*")
      .eq("action", ADMIN_DASHBOARD_SESSION_AUDIT_ACTION)
      .eq(resourceField, userId)
      .order("timestamp", { ascending: false })
      .limit(limit);

  const primary = await tryFetch("audit_log", "resource_id");
  if (!primary.error) {
    return {
      data: (primary.data ?? [])
        .map((row) => normalizeUserAuditExportLog(row))
        .filter((row): row is UserAuditExportLog => Boolean(row)),
    };
  }

  const fallback = await tryFetch("audit_logs", "resourceId");
  if (!fallback.error) {
    return {
      data: (fallback.data ?? [])
        .map((row) => normalizeUserAuditExportLog(row))
        .filter((row): row is UserAuditExportLog => Boolean(row)),
    };
  }

  return {
    data: [],
    error: primary.error?.message || fallback.error?.message,
  };
};

const toAdminAccessTimelineEntries = (
  logs: UserAuditExportLog[],
): UserActivityEntry[] =>
  logs
    .filter((log) => Boolean(log.timestamp))
    .map((log) => {
      const entryPath =
        typeof log.metadata?.entry_path === "string"
          ? log.metadata.entry_path
          : log.affected_entity?.name;
      const sourceIp =
        typeof log.metadata?.source_ip === "string"
          ? log.metadata.source_ip
          : log.source_ip;
      const pathLabel = entryPath ? ` via ${entryPath}` : "";
      const ipLabel = sourceIp ? ` from ${sourceIp}` : "";

      return {
        id: `admin-access-${log.id}`,
        action: "Admin dashboard access",
        description: `User successfully accessed the admin dashboard${pathLabel}${ipLabel}.`,
        created_at: log.timestamp,
        source: "admin_access" as const,
      };
    });

/**
 * Server action to fetch users for the dashboard.
 */
export async function getUsers(
  filters?: UserFiltersSchema,
  selectedAdvertiserIds: string[] = [],
): Promise<{ success: boolean; data?: User[]; error?: string }> {
  try {
    await requireCapability("users.read");
    const supabaseAdmin = createSupabaseAdminClient();
    if (filters?.role && !userRoleSchema.safeParse(filters.role).success) return { success: false, error: "Invalid user role filter" };

    let query = supabaseAdmin.from("user").select("*");

    if (filters?.role && ["rider", "advertiser"].includes(filters.role)) {
      query = query.eq("role", filters.role);
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

    const { data: employeeRows, error: employeeError } = await supabaseAdmin
      .from("admin_users").select("user_id, role");
    if (employeeError) return { success: false, error: employeeError.message };
    const employeeRoles = new Map((employeeRows ?? []).map((row) => [row.user_id, row.role]));

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
      role: isEmployeeRole(employeeRoles.get(row.id)) ? employeeRoles.get(row.id) : ["rider","advertiser"].includes(row.role) ? row.role : "unassigned",
      employeeRole: isEmployeeRole(employeeRoles.get(row.id)) ? employeeRoles.get(row.id) : null,
      accountType: row.role === "rider" || row.role === "advertiser" ? row.role : "employee",
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

    if (filters?.role) {
      users = users.filter((user) => user.role === filters.role || user.accountType === filters.role);
    }

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
): Promise<{ success: boolean; error?: string; warning?: string; data?: User }> {
  try {
    const auth = await requireCapability("users.manage", { mutation: true });
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

    const canonicalRole = isEmployeeRole(validatedData.role) ? validatedData.role : undefined;
    let account;
    if (canonicalRole) {
      await requireCapability(capabilityRequiredToAssignRole(canonicalRole), { mutation: true });
      account = await provisionEmployee(supabaseAdmin, auth.authUser.id, {
        email: validatedData.email, name: validatedData.name, role: canonicalRole,
        status: validatedData.status, phone: validatedData.phone, organization: validatedData.organization,
        languagePreference: validatedData.languagePreference, isVerified: validatedData.isVerified,
        accountNotes: validatedData.accountNotes, sendWelcomeEmail: validatedData.sendWelcomeEmail,
      });
    } else {
      if (validatedData.role === "advertiser") await requireCapability("advertisers.manage", { mutation: true });
      account = await provisionProduct(supabaseAdmin, auth.authUser.id, {
        email: validatedData.email, name: validatedData.name, role: validatedData.role as "rider" | "advertiser",
        status: validatedData.status, phone: validatedData.phone, organization: validatedData.organization,
        languagePreference: validatedData.languagePreference, isVerified: validatedData.isVerified,
        accountNotes: validatedData.accountNotes, city: validatedData.city, country: validatedData.country,
        advertiserProfile: validatedData.advertiserProfile,
      });
    }
    const warning = validatedData.sendWelcomeEmail ? await notifyAccountSetup(supabaseAdmin, account) : undefined;
    await writeUserActivity(supabaseAdmin, {
      user_id: account.id, actor_user_id: auth.authUser.id, source: "account", action: "Account created",
      description: `Account provisioned with role ${account.role}.`, related_entity_type: "user", related_entity_id: account.id,
      metadata: { role: account.role, status: account.status },
    }).catch(() => undefined);
    revalidatePath("/users");
    return { success: true, warning, data: account as unknown as User };
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
    const auth = await requireCapability("users.manage", { mutation: true });
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

    if (validatedData.employeeRole !== undefined) {
      await requireCapability(validatedData.employeeRole ? capabilityRequiredToAssignRole(validatedData.employeeRole) : "users.role.assign", { mutation: true });
      updateData.employee_role = validatedData.employeeRole;
    }
    const { error } = await supabaseAdmin.rpc("update_admin_user_profile", {
      p_actor: auth.authUser.id, p_user: validatedData.id,
      p_patch: updateData,
    });

    if (error) {
      console.error("Update user error:", error);
      return { success: false, error: error.message };
    }

    if (validatedData.status) {
      const authStatus = await supabaseAdmin.auth.admin.updateUserById(validatedData.id, {
        ban_duration: validatedData.status === "active" ? "none" : "876000h",
      });
      if (authStatus.error) return { success: false, error: `Profile saved; Auth status needs retry: ${authStatus.error.message}` };
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
    const supabaseAdmin = createSupabaseAdminClient();
    const validatedData = updateUserRoleSchema.parse(data);
    const canonicalRole = validatedData.role;
    // PostgreSQL checks both the previous and requested role under the shared
    // lock, including privileged demotion and revocation by security approvers.
    const auth = await requireAnyCapability(["users.role.assign", "users.role.approve"], { mutation: true });

    const { error } = await supabaseAdmin.rpc("assign_employee_role", {
      p_actor: auth.authUser.id, p_user: validatedData.userId, p_role: canonicalRole,
    });
    if (error) return { success: false, error: error.message };

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
    const auth = await requireCapability("users.manage", { mutation: true });
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

    const authStatus = await supabaseAdmin.auth.admin.updateUserById(validatedData.userId, {
      ban_duration: validatedData.status === "active" ? "none" : "876000h",
    });
    if (authStatus.error) return { success: false, error: `Account status saved; Auth status needs retry: ${authStatus.error.message}` };

    // Suspension preserves the exact employee template. Access readers enforce
    // public account status; rebuilding from coarse user.role would promote a
    // Partner Operations Manager to the legacy admin capability bundle.

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
    const auth = await requireCapability("users.manage", { mutation: true });
    const supabaseAdmin = createSupabaseAdminClient();
    const securityPolicy = await getPlatformSecurityPolicy();
    const allowPasswordResetLinks =
      securityPolicy.allowPasswordResetLinks !== false;

    if (!allowPasswordResetLinks) {
      return {
        success: false,
        error:
          "Password reset links are disabled by the current security policy.",
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

    const hashedToken = data?.properties?.hashed_token;
    if (!hashedToken) {
      return { success: false, error: "Password reset link not generated" };
    }
    const resetLink = buildConfirmUrl(hashedToken, "recovery");

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
      subject: "Reset your MOVRR Admin password",
      react: PasswordResetEmail({
        name: profileRow?.name || "there",
        resetUrl: resetLink,
      }),
      text: passwordResetText({
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
    await requireCapability("users.read");
    // Operational read access does not authorize a full account-data export.
    await requireCapability("exports.execute", { mutation: true });
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

    const [activityFeed, adminSessionAuditLogs] = await Promise.all([
      fetchUserActivityFeed(supabaseAdmin, userId, 250),
      fetchAdminSessionAuditLogs(supabaseAdmin, userId, 100),
    ]);

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
      activityLogs: activityFeed.available ? activityFeed.data : [],
      auditLogs: adminSessionAuditLogs.data,
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
    const auth = await requireCapability("users.manage", { mutation: true });
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
      metadata: {
        name: targetUser?.name ?? null,
        email: targetUser?.email ?? null,
      },
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
    await requireCapability("users.manage", { mutation: true });
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

    for (const row of data ?? []) {
      const authStatus = await supabaseAdmin.auth.admin.updateUserById(row.id, {
        ban_duration: status === "active" ? "none" : "876000h",
      });
      if (authStatus.error) return { success: false, error: `Account statuses saved; Auth status needs retry: ${authStatus.error.message}` };
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
    await requireCapability("users.read");
    const supabaseAdmin = createSupabaseAdminClient();
    const canonicalFeed = await fetchUserActivityFeed(
      supabaseAdmin,
      userId,
      limit,
    );
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
      adminSessionAuditResult,
      routeResult,
      rewardResult,
      campaignAssignmentResult,
      campaignSignupResult,
    ] = await Promise.all([
      fetchAdminSessionAuditLogs(supabaseAdmin, userId, 5),
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
            .select(
              "id, campaign_id, created_at, assigned_at, selected_at, confirmed_at",
            )
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
      adminSessionAuditResult.error,
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

    entries.push(...toAdminAccessTimelineEntries(adminSessionAuditResult.data));

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
    await requireCapability("users.read");
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
    await requireCapability("users.read");
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
 * Fetches reward transactions for a user by resolving userId ? riderId, then
 * returning fully-parsed RewardTransaction objects (metadata, bonusBreakdown, etc.).
 */
export async function getUserRewardTransactions(
  userId: string,
  limit: number = 50,
): Promise<{ success: boolean; error?: string; data?: RewardTransaction[] }> {
  try {
    await requireCapability("users.read");
    const supabaseAdmin = createSupabaseAdminClient();

    const { data: rider } = await supabaseAdmin
      .from("rider")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();

    if (!rider?.id) return { success: true, data: [] };

    const { data: txns, error } = await supabaseAdmin
      .from(DB_TABLES.REWARD_TRANSACTIONS)
      .select(
        "id, rider_id, campaign_id, route_tracking_id, points_earned, source, metadata, created_at",
      )
      .eq("rider_id", rider.id)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) return { success: false, error: error.message };

    const mapped = (txns ?? []).map((txn) => {
      const m = parseRewardMetadata(txn.metadata);
      const isDebit = m.adjustmentDirection === "debit";
      const points = Number(txn.points_earned ?? 0) * (isDebit ? -1 : 1);

      return {
        id: txn.id,
        riderId: txn.rider_id,
        campaignId: txn.campaign_id ?? undefined,
        routeId: txn.route_tracking_id ?? undefined,
        rideSessionId: m.rideSessionId,
        type: (txn.source === REWARD_SOURCE.ADJUSTMENT
          ? "adjusted"
          : "awarded") as RewardTransaction["type"],
        source: txn.source ?? undefined,
        earningMode: m.earningMode,
        points,
        description: m.description,
        balanceAfter: 0,
        createdAt: txn.created_at ?? new Date().toISOString(),
        createdBy: m.createdBy,
        basePoints: m.basePoints,
        multiplier: m.multiplier,
        campaignBoostMultiplier: m.campaignBoostMultiplier,
        wasCapped: m.wasCapped,
        verifiedMinutes: m.verifiedMinutes,
        bonusBreakdown: m.bonusBreakdown,
        pointsBeforeBonuses: m.pointsBeforeBonuses,
        fixedBonusPoints: m.fixedBonusPoints,
        pointsBeforeCap: m.pointsBeforeCap,
        cappedPoints: m.cappedPoints,
        appliedModifiers: m.appliedModifiers,
      } as RewardTransaction;
    });

    return { success: true, data: mapped };
  } catch (error) {
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
    await requireCapability("users.read");
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
