import { mockUsers } from "@/data/mockUsers";
import { RootState } from "@/redux/store";
import { UserRole } from "@/schemas";
import { useQuery } from "@tanstack/react-query";
import { useSelector } from "react-redux";

export const useUserStats = () => {
  const selectedAdvertiserIds = useSelector(
    (state: RootState) => state.advertiserFilter.selectedAdvertiserIds
  );

  return useQuery({
    queryKey: ["user-stats", selectedAdvertiserIds],
    queryFn: async () => {
      await new Promise((resolve) => setTimeout(resolve, 300));

      const filteredUsers = selectedAdvertiserIds.length
        ? mockUsers.filter(
            (u) =>
              u.role !== "advertiser" || selectedAdvertiserIds.includes(u.id)
          )
        : mockUsers;

      const total = filteredUsers.length;
      const active = filteredUsers.filter((u) => u.status === "active").length;

      const roleCounts = filteredUsers.reduce(
        (acc, user) => {
          acc[user.role as UserRole] = (acc[user.role as UserRole] || 0) + 1;
          return acc;
        },
        {} as Record<UserRole, number>
      );

      const latestUser = [...filteredUsers].sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      )[0];

      return {
        total,
        active,
        inactive: total - active,
        roleCounts,
        latestCreated: latestUser ? new Date(latestUser.createdAt) : null,
      };
    },
  });
};
