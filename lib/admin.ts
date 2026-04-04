import "server-only";

import { createSupabaseServerClient } from "./supabase-server";
import { createSupabaseAdminClient } from "./supabase-admin";
import { headers } from "next/headers";
import { normalizeAdminRole } from "@/lib/authPermissions";
import {
  ADMIN_DASHBOARD_SESSION_AUDIT_ACTION,
  ADMIN_SESSION_ACTIVITY_ACTION,
} from "@/lib/adminAccessMonitoring";
import { getServerAdminAuthenticatorAssurance } from "@/lib/adminMfa";
import { logger } from "@/lib/logger";
import { getPlatformSecurityPolicy } from "@/lib/platformSettings";
import { writeUserActivity } from "@/lib/userActivity";
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
  "compliance_officer",
  "government",
];

const EXCLUDED_PATHS = ["/auth", "/unauthorized"] as const;
const ADMIN_SESSION_BOOTSTRAP_GRACE_MS = 2 * 60_000;
const ADMIN_SESSION_TOUCH_INTERVAL_MS = 60_000;
const ADMIN_SESSION_ABSOLUTE_MAX_MS = 12 * 60 * 60_000;

export type AdminAuthErrorCode =
  | "UNAUTHENTICATED"
  | "NOT_ADMIN"
  | "INVALID_ADMIN_ROLE"
  | "MFA_REQUIRED"
  | "SESSION_EXPIRED"
  | "SESSION_BOOTSTRAP_REQUIRED"
  | "SESSION_BOOTSTRAP_FAILED"
  | "NOT_AUTHORIZED"
  | "AUTH_INTERNAL_ERROR";

export class AdminAuthError extends Error {
  constructor(
    public readonly code: AdminAuthErrorCode,
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "AdminAuthError";
  }
}

export const isAdminAuthError = (value: unknown): value is AdminAuthError =>
  value instanceof AdminAuthError;

type AdminDashboardSessionRow = {
  auth_user_id: string;
  admin_user_id: string;
  auth_last_sign_in_at: string | null;
  session_started_at: string;
  last_seen_at: string;
  session_expires_at: string;
  entry_path: string | null;
  source_ip: string | null;
  user_agent: string | null;
};

type EnforcedSecurityPolicy = Awaited<
  ReturnType<typeof getPlatformSecurityPolicy>
>;

const parseTimestamp = (value?: string | null) => {
  if (typeof value !== "string" || !value.trim()) return null;

  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? null : timestamp;
};

const extractSourceIp = (value?: string | null) => {
  if (!value) return null;

  const [ipAddress] = value.split(",");
  return ipAddress?.trim() || null;
};

const resolveRequestContext = async () => {
  const headerStore = await headers();
  const rawPath =
    headerStore.get("x-pathname") ??
    headerStore.get("x-invoke-path") ??
    headerStore.get("next-url") ??
    headerStore.get("x-url");

  let pathname: string | undefined;

  if (rawPath) {
    try {
      pathname = new URL(rawPath, "http://localhost").pathname;
    } catch {
      pathname = rawPath.split("?")[0];
    }
  }

  return {
    pathname,
    sourceIp:
      extractSourceIp(headerStore.get("x-forwarded-for")) ??
      extractSourceIp(headerStore.get("x-real-ip")),
    userAgent: headerStore.get("user-agent")?.trim() || null,
  };
};

const resolvePathnameFromHeaders = async (): Promise<string | undefined> => {
  const requestContext = await resolveRequestContext();
  return requestContext.pathname;
};

export const resolveAdminAuthRedirectTarget = async (): Promise<string> => {
  const pathname = await resolvePathnameFromHeaders();

  if (!pathname || !shouldResolveRoleForPath(pathname)) {
    return "/";
  }

  return pathname;
};

const shouldResolveRoleForPath = (pathname?: string) => {
  if (!pathname) return true;
  return !EXCLUDED_PATHS.some((path) => pathname.startsWith(path));
};

const isWithinBootstrapGraceWindow = (lastSignInAt: number | null) => {
  if (lastSignInAt === null) {
    return false;
  }

  return Date.now() - lastSignInAt <= ADMIN_SESSION_BOOTSTRAP_GRACE_MS;
};

const timestampsMatchWithinSkew = (
  left?: string | null,
  right?: string | null,
) => {
  const leftTimestamp = parseTimestamp(left);
  const rightTimestamp = parseTimestamp(right);

  if (leftTimestamp === null || rightTimestamp === null) {
    return false;
  }

  return Math.abs(leftTimestamp - rightTimestamp) <= 1000;
};

const fetchActiveAdminDashboardSession = async (authUserId: string) => {
  const supabaseAdmin = createSupabaseAdminClient();
  const { data, error } = await supabaseAdmin
    .from("admin_dashboard_sessions")
    .select(
      "auth_user_id, admin_user_id, auth_last_sign_in_at, session_started_at, last_seen_at, session_expires_at, entry_path, source_ip, user_agent",
    )
    .eq("auth_user_id", authUserId)
    .maybeSingle<AdminDashboardSessionRow>();

  if (error) {
    throw new AdminAuthError(
      "AUTH_INTERNAL_ERROR",
      "Unable to validate the current admin session.",
      error,
    );
  }

  return data;
};

const resolveTrustedAdminSession = async (authUser: {
  id: string;
  last_sign_in_at?: string | null;
}) => {
  const activeSession = await fetchActiveAdminDashboardSession(authUser.id);

  if (!activeSession) {
    return null;
  }

  if (
    !timestampsMatchWithinSkew(
      activeSession.auth_last_sign_in_at,
      authUser.last_sign_in_at,
    )
  ) {
    return null;
  }

  return activeSession;
};

const computeSessionAges = (
  trustedSession: AdminDashboardSessionRow,
  policy: EnforcedSecurityPolicy,
) => {
  const now = Date.now();
  const sessionStartedAt = parseTimestamp(trustedSession.session_started_at);
  const lastSeenAt = parseTimestamp(trustedSession.last_seen_at);
  const sessionExpiresAt = parseTimestamp(trustedSession.session_expires_at);
  const inactivityAgeMinutes =
    lastSeenAt === null ? null : Math.max(0, (now - lastSeenAt) / 60_000);
  const absoluteAgeMinutes =
    sessionStartedAt === null
      ? null
      : Math.max(0, (now - sessionStartedAt) / 60_000);
  const inactivityExpired =
    sessionExpiresAt !== null
      ? now > sessionExpiresAt
      : inactivityAgeMinutes !== null &&
        inactivityAgeMinutes > policy.adminSessionTimeoutMinutes;
  const absoluteExpired =
    sessionStartedAt !== null && now - sessionStartedAt > ADMIN_SESSION_ABSOLUTE_MAX_MS;

  return {
    inactivityAgeMinutes,
    absoluteAgeMinutes,
    inactivityExpired,
    absoluteExpired,
  };
};

const resolveAdminDisplayName = (authUser: {
  email?: string | null;
  user_metadata?: Record<string, unknown>;
}) => {
  const fullName = authUser.user_metadata?.full_name;
  if (typeof fullName === "string" && fullName.trim()) {
    return fullName.trim();
  }

  return authUser.email?.trim() || "Admin User";
};

const enforceSecurityPolicy = async (authUser: {
  id: string;
  last_sign_in_at?: string | null;
}, assuranceLevel?: string | null) => {
  const policy = await getPlatformSecurityPolicy();
  const trustedSession = await resolveTrustedAdminSession(authUser);
  const lastSignInAt = parseTimestamp(authUser.last_sign_in_at);
  const aal = typeof assuranceLevel === "string" ? assuranceLevel : null;

  if (policy.enforceAdminMfa && aal !== "aal2") {
    logger.warn("Admin MFA requirement not satisfied", {
      userId: authUser.id,
      aal: aal ?? "missing",
    });
    throw new AdminAuthError(
      "MFA_REQUIRED",
      "Admin MFA is required by the current security policy.",
    );
  }

  if (trustedSession === null) {
    if (isWithinBootstrapGraceWindow(lastSignInAt)) {
      return {
        policy,
        trustedSession,
        sessionState: {
          inactivityAgeMinutes: null,
          absoluteAgeMinutes: null,
          aal,
          timeoutEnforced: false,
          bootstrapPending: true,
        },
      };
    }

    throw new AdminAuthError(
      "SESSION_BOOTSTRAP_REQUIRED",
      "Admin session has expired under the current security policy.",
    );
  }

  const {
    inactivityAgeMinutes,
    absoluteAgeMinutes,
    inactivityExpired,
    absoluteExpired,
  } = computeSessionAges(trustedSession, policy);

  if (inactivityExpired || absoluteExpired) {
    logger.info("Admin session expired under security policy", {
      userId: authUser.id,
      inactivityAgeMinutes,
      absoluteAgeMinutes,
      timeoutMinutes: policy.adminSessionTimeoutMinutes,
      absoluteMaxMinutes: ADMIN_SESSION_ABSOLUTE_MAX_MS / 60_000,
    });
    throw new AdminAuthError(
      "SESSION_EXPIRED",
      "Admin session has expired under the current security policy.",
    );
  }

  return {
    policy,
    trustedSession,
    sessionState: {
      inactivityAgeMinutes,
      absoluteAgeMinutes,
      aal,
      timeoutEnforced: true,
      bootstrapPending: false,
    },
  };
};

const persistAdminDashboardSession = async (
  user: AuthenticatedUser,
  policy: EnforcedSecurityPolicy,
  trustedSession: AdminDashboardSessionRow | null,
) => {
  const requestContext = await resolveRequestContext();
  const now = new Date().toISOString();
  const sessionExpiresAt = new Date(
    Date.now() + policy.adminSessionTimeoutMinutes * 60_000,
  ).toISOString();
  const supabaseAdmin = createSupabaseAdminClient();
  const performedBy = {
    id: user.authUser.id,
    name: resolveAdminDisplayName(user.authUser),
    email: user.adminUser.email,
    role: user.adminUser.role,
  };

  if (trustedSession !== null) {
    const lastSeenAt = parseTimestamp(trustedSession.last_seen_at);
    const shouldTouchSession =
      lastSeenAt === null || Date.now() - lastSeenAt >= ADMIN_SESSION_TOUCH_INTERVAL_MS;

    if (!shouldTouchSession) {
      return;
    }

    const { error: updateError } = await supabaseAdmin
      .from("admin_dashboard_sessions")
      .upsert(
        {
          auth_user_id: user.authUser.id,
          admin_user_id: user.adminUser.id,
          auth_last_sign_in_at:
            trustedSession.auth_last_sign_in_at ?? user.authUser.last_sign_in_at ?? null,
          session_started_at: trustedSession.session_started_at,
          last_seen_at: now,
          session_expires_at: sessionExpiresAt,
          entry_path: requestContext.pathname ?? trustedSession.entry_path ?? "/",
          source_ip: requestContext.sourceIp ?? trustedSession.source_ip,
          user_agent: requestContext.userAgent ?? trustedSession.user_agent,
          updated_at: now,
        },
        { onConflict: "auth_user_id" },
      );

    if (updateError) {
      logger.error("Failed to refresh admin dashboard session activity", updateError, {
        userId: user.authUser.id,
        pathname: requestContext.pathname,
      });
      throw new AdminAuthError(
        "AUTH_INTERNAL_ERROR",
        "Unable to refresh the current admin session.",
        updateError,
      );
    }

    return;
  }

  const sessionStartedAt = now;
  const { error: sessionError } = await supabaseAdmin
    .from("admin_dashboard_sessions")
    .upsert(
      {
        auth_user_id: user.authUser.id,
        admin_user_id: user.adminUser.id,
        auth_last_sign_in_at: user.authUser.last_sign_in_at ?? null,
        session_started_at: sessionStartedAt,
        last_seen_at: sessionStartedAt,
        session_expires_at: sessionExpiresAt,
        entry_path: requestContext.pathname ?? "/",
        source_ip: requestContext.sourceIp,
        user_agent: requestContext.userAgent,
        updated_at: sessionStartedAt,
      },
      { onConflict: "auth_user_id" },
    );

  if (sessionError) {
    logger.error("Failed to persist admin dashboard session", sessionError, {
      userId: user.authUser.id,
      pathname: requestContext.pathname,
    });
    throw new AdminAuthError(
      "SESSION_BOOTSTRAP_FAILED",
      "Unable to establish a trusted admin session.",
      sessionError,
    );
  }

  const metadata = {
    entry_path: requestContext.pathname ?? "/",
    role: user.adminUser.role,
    session_started_at: sessionStartedAt,
    last_sign_in_at: user.authUser.last_sign_in_at ?? null,
    source_ip: requestContext.sourceIp,
    user_agent: requestContext.userAgent,
  };

  try {
    await writeUserActivity(supabaseAdmin, {
      user_id: user.authUser.id,
      actor_user_id: user.authUser.id,
      source: "admin_access",
      action: ADMIN_SESSION_ACTIVITY_ACTION,
      description: `${performedBy.email} started an admin dashboard session.`,
      related_entity_type: "admin_user",
      related_entity_id: user.adminUser.id,
      metadata,
      occurred_at: sessionStartedAt,
    });
  } catch (error) {
    logger.error("Failed to write admin dashboard session activity", error, {
      userId: user.authUser.id,
      pathname: requestContext.pathname,
    });
  }

  const { error: auditError } = await supabaseAdmin.from("audit_log").insert({
    action: ADMIN_DASHBOARD_SESSION_AUDIT_ACTION,
    result: "Success",
    performed_by: performedBy,
    affected_entity: {
      type: "admin_dashboard_session",
      id: user.authUser.id,
      name: requestContext.pathname ?? "/",
    },
    timestamp: sessionStartedAt,
    source_ip: requestContext.sourceIp,
    user_agent: requestContext.userAgent,
    resource_id: user.authUser.id,
    metadata,
  });

  if (auditError) {
    logger.error(
      "Failed to write admin dashboard session audit log",
      auditError,
      {
        userId: user.authUser.id,
        pathname: requestContext.pathname,
      },
    );
  }
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
      throw new AdminAuthError("NOT_ADMIN", "Not authorized", adminError);
    }

    // Validate role
    const role = adminRow.role.toLowerCase() as AdminRole;
    const isValidRole = VALID_ADMIN_ROLES.includes(role);

    if (!isValidRole) {
      logger.warn("Invalid admin role found for authenticated user", {
        userId: authUser.id,
        role,
      });
      throw new AdminAuthError("INVALID_ADMIN_ROLE", "Not authorized");
    }

    const authenticatedUser = {
      authUser,
      adminUser: {
        ...adminRow,
        role,
      } as AdminUser,
    };
    const assuranceData = await getServerAdminAuthenticatorAssurance(authUser);
    const enforcement = await enforceSecurityPolicy(
      authUser,
      assuranceData.currentLevel,
    );
    await persistAdminDashboardSession(
      authenticatedUser,
      enforcement.policy,
      enforcement.trustedSession,
    );

    return authenticatedUser;
  } catch (error) {
    if (isAdminAuthError(error)) {
      throw error;
    }

    logger.error("getAuthenticatedUser error", error);
    throw new AdminAuthError(
      "AUTH_INTERNAL_ERROR",
      "Authentication service unavailable.",
      error,
    );
  }
}

/**
 * Check if user has specific permission (for server components/actions)
 */
export async function requireAdmin(): Promise<AuthenticatedUser> {
  const user = await getAuthenticatedUser();

  if (!user) {
    throw new AdminAuthError("UNAUTHENTICATED", "Authentication required");
  }

  return user;
}

export async function requireAdminRoles(
  allowedRoles: readonly string[],
): Promise<AuthenticatedUser> {
  const user = await requireAdmin();

  if (!allowedRoles.includes(user.adminUser.role)) {
    throw new AdminAuthError("NOT_AUTHORIZED", "Not authorized");
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
