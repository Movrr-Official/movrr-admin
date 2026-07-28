"use client";

import { useQuery } from "@tanstack/react-query";
import { subDays } from "date-fns";
import { AuditFilters, AuditLog } from "@/schemas";
import { mockAuditLogs } from "@/data/mockAuditLogs";
import { shouldUseMockData } from "@/lib/dataSource";

const buildAuditLogsUrl = (filters?: AuditFilters) => {
  const params = new URLSearchParams();

  if (filters?.actionType && filters.actionType !== "all") {
    params.set("actionType", filters.actionType);
  }
  if (filters?.searchQuery?.trim()) {
    params.set("searchQuery", filters.searchQuery.trim());
  }
  if (filters?.performedBy?.trim()) {
    params.set("performedBy", filters.performedBy.trim());
  }
  if (filters?.dateRange?.from) {
    params.set("from", filters.dateRange.from.toISOString());
  }
  if (filters?.dateRange?.to) {
    params.set("to", filters.dateRange.to.toISOString());
  }

  const query = params.toString();
  return query ? `/api/audit-logs?${query}` : "/api/audit-logs";
};

export const useAuditLogsData = (filters?: AuditFilters) => {
  return useQuery<AuditLog[]>({
    queryKey: ["audit-logs", filters],
    queryFn: async () => {
      if (!shouldUseMockData()) {
        const response = await fetch(buildAuditLogsUrl(filters), {
          method: "GET",
          credentials: "same-origin",
          headers: { Accept: "application/json" },
        });

        if (!response.ok) {
          let message = "Failed to fetch audit logs";
          try {
            const payload = (await response.json()) as { error?: string };
            if (payload.error) message = payload.error;
          } catch {
            // ignore JSON parse failures
          }
          if (response.status === 431) {
            message =
              "Request headers too large (auth cookies). Restart the dev server and clear site cookies for localhost:3001.";
          }
          throw new Error(message);
        }

        const payload = (await response.json()) as {
          data?: AuditLog[];
          error?: string;
        };
        if (!payload.data) {
          throw new Error(payload.error || "Failed to fetch audit logs");
        }
        return payload.data;
      }

      // Apply filters to mock data
      let logs = [...mockAuditLogs];

      if (filters?.dateRange?.from || filters?.dateRange?.to) {
        const startDate = filters.dateRange?.from || subDays(new Date(), 30);
        const endDate = filters.dateRange?.to || new Date();
        const rangeMs = Math.max(0, endDate.getTime() - startDate.getTime());
        const total = logs.length || 1;

        logs = logs
          .slice()
          .sort(
            (a, b) =>
              new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
          )
          .map((log, index) => {
            const offset = Math.round((rangeMs * index) / total);
            const timestamp = new Date(startDate.getTime() + offset);
            return { ...log, timestamp: timestamp.toISOString() };
          });
      }

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
              .includes(filters.performedBy?.toLowerCase() || ""),
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
