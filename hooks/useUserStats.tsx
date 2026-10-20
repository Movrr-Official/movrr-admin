import { useMemo } from "react";
import { UserFiltersSchema, UserRole } from "@/schemas";
import { useUsersData } from "@/hooks/useUsersData";

export const useUserStats = (filters?: UserFiltersSchema) => {
  // Share the same account-scoped query and error state as the user chart.
  const query = useUsersData(filters);
  const data = useMemo(() => {
      if (!query.data) return undefined;
      let filteredUsers = query.data;

      if (filters?.dateRange?.from || filters?.dateRange?.to) {
        const from = filters.dateRange?.from
          ? new Date(filters.dateRange.from)
          : null;
        const to = filters.dateRange?.to
          ? new Date(filters.dateRange.to)
          : null;
        filteredUsers = filteredUsers.filter((user) => {
          const createdAt = new Date(user.createdAt);
          if (from && createdAt < from) return false;
          if (to && createdAt > to) return false;
          return true;
        });
      }

      const total = filteredUsers.length;
      const active = filteredUsers.filter((u) => u.status === "active").length;

      const roleCounts = filteredUsers.reduce(
        (acc, user) => {
          acc[user.role as UserRole] = (acc[user.role as UserRole] || 0) + 1;
          return acc;
        },
        {} as Record<UserRole, number>,
      );

      const latestUser = [...filteredUsers].sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      )[0];

      return {
        total,
        active,
        inactive: total - active,
        roleCounts,
        latestCreated: latestUser ? new Date(latestUser.createdAt) : null,
      };
  }, [query.data, filters?.dateRange?.from, filters?.dateRange?.to]);
  return { ...query, data };
};
