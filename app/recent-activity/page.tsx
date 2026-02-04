"use client";

import { useMemo, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuditLogsData } from "@/hooks/useAuditLogsData";

const PAGE_SIZE = 12;

export default function RecentActivityPage() {
  const [page, setPage] = useState(1);
  const { data: auditLogs = [], isLoading, isError } = useAuditLogsData({});

  const total = auditLogs.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const clampedPage = Math.min(page, totalPages);
  const startIndex = (clampedPage - 1) * PAGE_SIZE;
  const endIndex = Math.min(startIndex + PAGE_SIZE, total);

  const pageItems = useMemo(
    () => auditLogs.slice(startIndex, endIndex),
    [auditLogs, startIndex, endIndex],
  );

  return (
    <div className="min-h-screen gradient-bg px-4 sm:px-6 py-8 md:py-12 lg:py-16 lg:pt-6">
      <div className="space-y-6 md:space-y-8">
        <PageHeader
          title="Recent activity"
          description="A complete timeline of admin actions and system events."
        />

        <Card className="glass-card border-0">
          <CardHeader className="pb-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CardTitle className="text-xl font-bold">
                Activity history
              </CardTitle>
              {!isLoading && !isError && (
                <p className="text-sm text-muted-foreground">
                  Showing {total === 0 ? 0 : startIndex + 1}–{endIndex} of{" "}
                  {total}
                </p>
              )}
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
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/60 bg-background px-4 py-3"
                  >
                    <div>
                      <p className="text-sm font-semibold text-foreground">
                        {log.action}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {log.affectedEntity?.name ?? "System"} ·{" "}
                        {new Date(log.timestamp).toLocaleString("en-US", {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}
                      </p>
                    </div>
                    <Badge variant="outline" className="text-xs">
                      {log.performedBy?.name ?? "Automated"}
                    </Badge>
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
