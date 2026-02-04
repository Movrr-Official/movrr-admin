"use client";

import { useQuery } from "@tanstack/react-query";
import {
  AdminNotification,
  NotificationFilters,
  NotificationStats,
} from "@/schemas";
import {
  getNotificationHistory,
  getNotificationStats,
} from "@/app/actions/notifications";
import { shouldUseMockData } from "@/lib/dataSource";
import { mockNotifications } from "@/data/mockNotifications";

export const useNotificationsHistory = (filters?: NotificationFilters) => {
  return useQuery<AdminNotification[]>({
    queryKey: ["adminNotifications", filters],
    queryFn: async () => {
      await new Promise((resolve) => setTimeout(resolve, 400));

      if (shouldUseMockData()) {
        let notifications = [...mockNotifications];

        if (filters?.type) {
          notifications = notifications.filter(
            (notification) => notification.type === filters.type,
          );
        }

        if (filters?.status === "read") {
          notifications = notifications.filter(
            (notification) => notification.isRead,
          );
        }

        if (filters?.status === "unread") {
          notifications = notifications.filter(
            (notification) => !notification.isRead,
          );
        }

        if (filters?.searchQuery) {
          const query = filters.searchQuery.toLowerCase();
          notifications = notifications.filter(
            (notification) =>
              notification.title.toLowerCase().includes(query) ||
              notification.message.toLowerCase().includes(query) ||
              notification.recipient?.name?.toLowerCase().includes(query) ||
              notification.recipient?.email?.toLowerCase().includes(query),
          );
        }

        return notifications.sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        );
      }

      const result = await getNotificationHistory(filters);
      if (!result.success || !result.data) {
        throw new Error(result.error || "Failed to fetch notifications");
      }
      return result.data;
    },
    staleTime: 1000 * 60 * 2,
    gcTime: 1000 * 60 * 5,
  });
};

export const useNotificationStats = () => {
  return useQuery<NotificationStats>({
    queryKey: ["adminNotificationStats"],
    queryFn: async () => {
      await new Promise((resolve) => setTimeout(resolve, 300));

      if (shouldUseMockData()) {
        const total = mockNotifications.length;
        const unread = mockNotifications.filter((n) => !n.isRead).length;
        const read = total - unread;
        const sevenDaysAgo = Date.now() - 1000 * 60 * 60 * 24 * 7;
        const last7Days = mockNotifications.filter(
          (n) => new Date(n.createdAt).getTime() >= sevenDaysAgo,
        ).length;

        return { total, read, unread, last7Days };
      }

      const result = await getNotificationStats();
      if (!result.success || !result.data) {
        throw new Error(result.error || "Failed to fetch notification stats");
      }
      return result.data;
    },
    staleTime: 1000 * 60 * 2,
    gcTime: 1000 * 60 * 5,
  });
};
