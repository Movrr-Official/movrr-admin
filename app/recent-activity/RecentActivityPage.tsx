"use client";

import { useDeferredValue, useMemo, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuditLogsData } from "@/hooks/useAuditLogsData";
import {
  formatRoleLabel,
  getAuditLogEntryPath,
  getAuditLogResultLabel,
  getAuditLogSourceIp,
  getAuditLogUserAgent,
  isAdminDashboardSessionLog,
} from "@/lib/adminAccessMonitoring";
import { type AuditAction, auditActionSchema } from "@/schemas";

const PAGE_SIZE = 12;

export default function RecentActivityPage() {
  const [page, setPage] = useState(1);
  const [actionType, setActionType] = useState<AuditAction>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const deferredSearchQuery = useDeferredValue(searchQuery.trim());
  const {
    data: auditLogs = [],
    isLoading,
    isError,
  } = useAuditLogsData({
    actionType,
    searchQuery: deferredSearchQuery || undefined,
  });

  const total = auditLogs.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const clampedPage = Math.min(page, totalPages);
  const startIndex = (clampedPage - 1) * PAGE_SIZE;
  const endIndex = Math.min(startIndex + PAGE_SIZE, total);

  const pageItems = useMemo(
    () => auditLogs.slice(startIndex, endIndex),
    [auditLogs, startIndex, endIndex],
  );
  const actionOptions = auditActionSchema.options;

  return (
    <div className="min-h-screen gradient-bg px-4 sm:px-6 py-8 md:py-12 lg:py-16 lg:pt-6">
      <div className="space-y-6 md:space-y-8">
        <PageHeader
          title="Recent activity"
          description="A complete timeline of admin actions, system events, and dashboard access sessions."
        />

        <Card className="glass-card border-0">
          <CardHeader className="pb-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <CardTitle className="text-xl font-bold">
                  Activity history
                </CardTitle>
                {!isLoading && !isError && (
                  <p className="mt-1 text-sm text-muted-foreground">
                    Showing {total === 0 ? 0 : startIndex + 1}-{endIndex} of{" "}
                    {total}
                  </p>
                )}
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:min-w-[30rem]">
                <Select
                  value={actionType}
                  onValueChange={(value) => {
                    setActionType(value as AuditAction);
                    setPage(1);
                  }}
                >
                  <SelectTrigger className="w-full bg-background">
                    <SelectValue placeholder="Filter by activity type" />
                  </SelectTrigger>
                  <SelectContent>
                    {actionOptions.map((option) => (
                      <SelectItem key={option} value={option}>
                        {option === "all" ? "All activity" : option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Input
                  value={searchQuery}
                  onChange={(event) => {
                    setSearchQuery(event.target.value);
                    setPage(1);
                  }}
                  placeholder="Search actor, path, IP, or action"
                  className="bg-background"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
                Loading activity...
              </div>
            ) : isError ? (
              <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
                Unable to load activity history.
              </div>
            ) : (
              <div className="space-y-3">
                {pageItems.map((log) => (
                  <div
                    key={log.id}
                    className={`rounded-xl border px-4 py-3 ${
                      isAdminDashboardSessionLog(log)
                        ? "border-info/30 bg-info/5"
                        : "border-border/60 bg-background"
                    }`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-semibold text-foreground">
                            {log.action}
                          </p>
                          {isAdminDashboardSessionLog(log) && (
                            <Badge variant="info" className="text-[11px]">
                              Access monitoring
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {getAuditLogEntryPath(log)} ·{" "}
                          {new Date(log.timestamp).toLocaleString("en-US", {
                            dateStyle: "medium",
                            timeStyle: "short",
                          })}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          <span className="font-medium text-foreground/80">
                            {log.performedBy?.name ?? "Automated"}
                          </span>{" "}
                          ·{" "}
                          <span className="font-normal text-muted-foreground">
                            {log.performedBy?.email ?? "system@movrr.local"}
                          </span>
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="secondary" className="text-xs">
                          {formatRoleLabel(log.performedBy?.role)}
                        </Badge>
                        {getAuditLogResultLabel(log) && (
                          <Badge variant="secondary" className="text-xs">
                            {getAuditLogResultLabel(log)}
                          </Badge>
                        )}
                        {getAuditLogSourceIp(log) && (
                          <Badge variant="info" className="text-xs">
                            IP {getAuditLogSourceIp(log)}
                          </Badge>
                        )}
                      </div>
                    </div>

                    {getAuditLogUserAgent(log) && (
                      <p className="mt-2 truncate text-xs text-muted-foreground">
                        User agent: {getAuditLogUserAgent(log)}
                      </p>
                    )}
                  </div>
                ))}
                {!pageItems.length && (
                  <p className="text-sm text-muted-foreground">
                    No activity logged yet.
                  </p>
                )}
              </div>
            )}

            {!isLoading && !isError && total > PAGE_SIZE && (
              <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-muted-foreground">
                  Page {clampedPage} of {totalPages}
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                    disabled={clampedPage === 1}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setPage((prev) => Math.min(totalPages, prev + 1))
                    }
                    disabled={clampedPage === totalPages}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
