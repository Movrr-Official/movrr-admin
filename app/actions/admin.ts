"use server";

import { getAuthenticatedUser } from "@/lib/admin";
import { logger } from "@/lib/logger";

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
