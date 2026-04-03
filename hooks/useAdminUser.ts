"use client";

import { getCurrentAdminUser } from "@/app/actions/admin";
import { useQuery } from "@tanstack/react-query";
import useShouldHideComponent from "@/hooks/useShouldHideComponent";

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

// Optional: Hook for specific permissions
export function usePermission(permission: string) {
  const { data: adminUser } = useAdminUser();

  // Implement your permission logic here based on adminUser.role
  const hasPermission =
    adminUser?.role === "super_admin" || adminUser?.role === "admin";

  return hasPermission;
}
