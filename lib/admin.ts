"use server";

import { createSupabaseServerClient } from "./supabase-server";
import { createSupabaseAdminClient } from "./supabase-admin";
import { headers } from "next/headers";
import { normalizeAdminRole } from "@/lib/authPermissions";
import { logger } from "@/lib/logger";
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
