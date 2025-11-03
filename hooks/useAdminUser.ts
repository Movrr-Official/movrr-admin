"use client";

import { getCurrentAdminUser } from "@/app/actions/admin";
import { useQuery } from "@tanstack/react-query";

export function useAdminUser() {
  return useQuery({
    queryKey: ["adminUser"],
    queryFn: getCurrentAdminUser,
    staleTime: 1000 * 60 * 5, // 5 minutes
    retry: 1,
    refetchOnWindowFocus: false,
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
