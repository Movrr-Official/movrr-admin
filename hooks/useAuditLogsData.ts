"use client";

import { useQuery } from "@tanstack/react-query";
import { subDays } from "date-fns";
import { AuditFilters, AuditLog } from "@/schemas";
import { mockAuditLogs } from "@/data/mockAuditLogs";

export const useAuditLogsData = (filters?: AuditFilters) => {
  return useQuery<AuditLog[]>({
    queryKey: ["audit-logs", filters],
    queryFn: async () => {
      // Simulate network delay
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Apply filters to mock data
      let logs = [...mockAuditLogs];

      if (filters?.actionType && filters?.actionType !== "all") {
        logs = logs.filter((log) => log.action === filters?.actionType);
      }

      if (filters?.performedBy) {
        logs = logs.filter(
          (log) =>
            log.performedBy.name
              .toLowerCase()
              .includes(filters.performedBy?.toLowerCase() || "") ||
            log.performedBy.email
              .toLowerCase()
              .includes(filters.performedBy?.toLowerCase() || "")
        );
      }

      if (filters?.searchQuery?.trim()) {
        const query = filters.searchQuery.toLowerCase();

        logs = logs.filter((log) => {
          const actionMatch = log.action?.toLowerCase().includes(query);
          const entityMatch = log.affectedEntity?.name
            ?.toLowerCase()
            .includes(query);
          return actionMatch || entityMatch;
        });
      }

      if (filters?.dateRange?.from || filters?.dateRange?.to) {
        const startDate = filters.dateRange?.from || subDays(new Date(), 30);
        const endDate = filters.dateRange?.to || new Date();

        logs = logs.filter((log) => {
          const logDate = new Date(log.timestamp);
          return logDate >= startDate && logDate <= endDate;
        });
      }

      return logs;
    },
  });
};
