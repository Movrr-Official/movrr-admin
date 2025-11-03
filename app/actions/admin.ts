"use server";

import { getAuthenticatedUser } from "@/lib/admin";

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

    // You can integrate with your PermissionManager here
    // For now, just return true for admin users
    return true;
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
