"use server";

import { createSupabaseServerClient } from "./supabase-server";
import { createSupabaseAdminClient } from "./supabase-admin";
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
