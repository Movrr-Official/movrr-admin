"use client";

import { getCurrentAdminUser } from "@/app/actions/admin";
import { useQuery } from "@tanstack/react-query";
import useShouldHideComponent from "@/hooks/useShouldHideComponent";
import { hasAdminPermission, hasCapability } from "@/lib/authPermissions";

export const ADMIN_USER_QUERY_KEY = ["adminUser"] as const;

export function useAdminUser(options?: { enabled?: boolean }) {
  const shouldHideComponent = useShouldHideComponent();

  return useQuery({
    queryKey: ADMIN_USER_QUERY_KEY,
    queryFn: getCurrentAdminUser,
    staleTime: 1000 * 60 * 5, // 5 minutes
    retry: 1,
    refetchOnWindowFocus: false,
    enabled: !shouldHideComponent && (options?.enabled ?? true),
  });
}

/** Capability-first permission hook (also accepts legacy `module:action` strings). */
export function usePermission(permission: string) {
  const { data: adminUser } = useAdminUser();
  if (!adminUser?.role) return false;

  if (permission.includes(".")) {
    return hasCapability(adminUser.role, permission);
  }

  return hasAdminPermission(adminUser.role, permission);
}

/** Direct capability check for UI gating. */
export function useCapability(capability: string) {
  const { data: adminUser } = useAdminUser();
  if (!adminUser?.role) return false;
  return hasCapability(adminUser.role, capability);
}
