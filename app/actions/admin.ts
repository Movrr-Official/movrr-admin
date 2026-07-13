"use server";

import { getAuthenticatedUser } from "@/lib/admin";
import { hasAdminPermission } from "@/lib/authPermissions";
import { logger } from "@/lib/logger";
import type { AdminRole } from "@/types/auth";

/**
 * Server action to get the current admin user
 */
export async function getCurrentAdminUser() {
  try {
    const user = await getAuthenticatedUser();

    if (!user) {
      return null;
    }

    return user.adminUser;
  } catch (error) {
    logger.warn("getCurrentAdminUser error", {
      error: error instanceof Error ? error.message : String(error),
    });
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

    return hasAdminPermission(user.adminUser.role as AdminRole, normalizedPermission);
  } catch (error) {
    logger.warn("checkPermission error", {
      error: error instanceof Error ? error.message : String(error),
    });
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
    logger.warn("getUserRole error", {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}
