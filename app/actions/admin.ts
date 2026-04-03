"use server";

import { getAuthenticatedUser } from "@/lib/admin";
import type { AdminRole } from "@/types/auth";

const rolePermissions: Record<AdminRole, string[]> = {
  super_admin: ["*"],
  admin: [
    "dashboard:read",
    "users:read",
    "users:write",
    "routes:read",
    "routes:write",
    "campaigns:read",
    "campaigns:write",
    "rewards:read",
    "rewards:write",
    "settings:read",
    "settings:write",
    "notifications:read",
    "notifications:write",
  ],
  moderator: [
    "dashboard:read",
    "users:read",
    "routes:read",
    "campaigns:read",
    "rewards:read",
    "notifications:read",
  ],
  support: [
    "dashboard:read",
    "users:read",
    "routes:read",
    "campaigns:read",
    "rewards:read",
    "notifications:read",
  ],
  compliance_officer: [
    "dashboard:read",
    "users:read",
    "campaigns:read",
    "rewards:read",
    "notifications:read",
  ],
};

/**
 * Server action to get the current admin user
 */
export async function getCurrentAdminUser() {
  try {
    const user = await getAuthenticatedUser();

    if (!user) {
      // Return null instead of throwing to handle gracefully in client
      return null;
    }

    return user.adminUser;
  } catch (error) {
    console.error("getCurrentAdminUser error:", error);
    return null;
  }
}

/**
 * Server action to check if user has specific permission
 */
export async function checkPermission(permission: string) {
  try {
    const user = await getAuthenticatedUser();

    if (!user) {
      return false;
    }

    const normalizedPermission = permission.trim().toLowerCase();
    if (!normalizedPermission) {
      return false;
    }

    const permissions = rolePermissions[user.adminUser.role];
    return (
      permissions.includes("*") || permissions.includes(normalizedPermission)
    );
  } catch (error) {
    console.error("checkPermission error:", error);
    return false;
  }
}

/**
 * Server action to get user role
 */
export async function getUserRole() {
  try {
    const user = await getAuthenticatedUser();
    return user?.adminUser.role || null;
  } catch (error) {
    console.error("getUserRole error:", error);
    return null;
  }
}
