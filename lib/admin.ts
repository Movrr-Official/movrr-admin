"use server";

import { createSupabaseServerClient } from "./supabase-server";
import { createSupabaseAdminClient } from "./supabase-admin";
import { headers } from "next/headers";
import { normalizeAdminRole } from "@/lib/authPermissions";
import { logger } from "@/lib/logger";
import { getPlatformSecurityPolicy } from "@/lib/platformSettings";
import {
  type AdminUser,
  type AuthenticatedUser,
  type AdminRole,
} from "@/types/auth";

const VALID_ADMIN_ROLES: AdminRole[] = [
  "super_admin",
  "admin",
  "moderator",
  "support",
];

const EXCLUDED_PATHS = ["/auth", "/unauthorized"] as const;

const resolvePathnameFromHeaders = async (): Promise<string | undefined> => {
  const headerStore = await headers();
  const rawPath =
    headerStore.get("x-pathname") ??
    headerStore.get("x-invoke-path") ??
    headerStore.get("next-url") ??
    headerStore.get("x-url");

  if (!rawPath) return undefined;

  try {
    return new URL(rawPath, "http://localhost").pathname;
  } catch {
    return rawPath.split("?")[0];
  }
};

const shouldResolveRoleForPath = (pathname?: string) => {
  if (!pathname) return true;
  return !EXCLUDED_PATHS.some((path) => pathname.startsWith(path));
};

const resolveTrustedAdminSessionStartedAt = (authUser: {
  app_metadata?: Record<string, unknown>;
  user_metadata?: Record<string, unknown>;
}) => {
  const candidates = [
    authUser.app_metadata?.admin_session_started_at,
    authUser.user_metadata?.admin_session_started_at,
  ];

  for (const candidate of candidates) {
    if (typeof candidate !== "string" || !candidate.trim()) continue;
    const timestamp = new Date(candidate).getTime();
    if (!Number.isNaN(timestamp)) {
      return timestamp;
    }
  }

  return null;
};

const enforceSecurityPolicy = async (
  authUser: {
    last_sign_in_at?: string | null;
    app_metadata?: Record<string, unknown>;
    user_metadata?: Record<string, unknown>;
  },
) => {
  const policy = await getPlatformSecurityPolicy();
  const trustedSessionStartedAt = resolveTrustedAdminSessionStartedAt(authUser);
  const ageMinutes =
    trustedSessionStartedAt === null
      ? null
      : Math.max(0, (Date.now() - trustedSessionStartedAt) / 60_000);
  const aal =
    typeof authUser.app_metadata?.aal === "string"
      ? authUser.app_metadata.aal
      : typeof authUser.user_metadata?.aal === "string"
        ? authUser.user_metadata.aal
        : undefined;

  if (policy.enforceAdminMfa && aal && aal !== "aal2") {
    throw new Error("Admin MFA is required by the current security policy.");
  }

  // Do not treat auth.users.last_sign_in_at as an active admin-session timer.
  // It is not a reliable signal for server-rendered dashboard requests and can
  // incorrectly expire valid sessions. Enforce timeout only when a dedicated,
  // trusted admin-session start marker exists.
  if (ageMinutes !== null && ageMinutes > policy.adminSessionTimeoutMinutes) {
    throw new Error("Admin session has expired under the current security policy.");
  }

  return {
    policy,
    sessionState: {
      ageMinutes,
      aal,
      timeoutEnforced: trustedSessionStartedAt !== null,
    },
  };
};

/**
 * Returns the authenticated admin user with role information
 */
export async function getAuthenticatedUser(): Promise<AuthenticatedUser | null> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user: authUser },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !authUser) {
      return null;
    }

    const supabaseAdmin = createSupabaseAdminClient();
    const { data: adminRow, error: adminError } = await supabaseAdmin
      .from("admin_users")
      .select("id, user_id, email, role, created_at, updated_at")
      .eq("user_id", authUser.id)
      .single();

    if (adminError || !adminRow) {
      return null;
    }

    // Validate role
    const role = adminRow.role.toLowerCase() as AdminRole;
    const isValidRole = VALID_ADMIN_ROLES.includes(role);

    if (!isValidRole) {
      console.warn(`Invalid admin role: ${role} for user ${authUser.id}`);
      return null;
    }

    await enforceSecurityPolicy(authUser);

    return {
      authUser,
      adminUser: {
        ...adminRow,
        role,
      } as AdminUser,
    };
  } catch (error) {
    console.error("getAuthenticatedUser error:", error);
    return null;
  }
}

/**
 * Check if user has specific permission (for server components/actions)
 */
export async function requireAdmin(): Promise<AuthenticatedUser> {
  const user = await getAuthenticatedUser();

  if (!user) {
    throw new Error("Authentication required");
  }

  return user;
}

export async function requireAdminRoles(
  allowedRoles: readonly string[],
): Promise<AuthenticatedUser> {
  const user = await requireAdmin();

  if (!allowedRoles.includes(user.adminUser.role)) {
    throw new Error("Not authorized");
  }

  return user;
}

export async function getAdminRoleForLayout(): Promise<AdminRole | undefined> {
  const pathname = await resolvePathnameFromHeaders();
  const shouldResolveRole = shouldResolveRoleForPath(pathname);

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) {
    logger.warn("Supabase getUser failed in RootLayout", {
      message: userError.message,
    });
  }

  if (!user || !shouldResolveRole) {
    return undefined;
  }

  const { data: adminUser, error: adminUserError } = await supabase
    .from("admin_users")
    .select("role")
    .eq("user_id", user.id)
    .single();

  if (adminUserError) {
    logger.warn("Admin role lookup failed in RootLayout", {
      message: adminUserError.message,
      userId: user.id,
    });
  }

  const rawRole =
    typeof adminUser?.role === "string" ? adminUser.role : undefined;
  const normalizedRole = normalizeAdminRole(rawRole);

  return normalizedRole as AdminRole | undefined;
}
