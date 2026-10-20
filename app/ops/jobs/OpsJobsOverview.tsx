"use client";

import Link from "next/link";
import { ExternalLink, RefreshCw } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { OpsKpiGrid } from "@/components/ops/OpsKpiGrid";
import { useSettingsData } from "@/hooks/useSettingsData";
import { OPS_JOB_DEFINITIONS } from "@/lib/ops/jobsConfig";

export default function OpsJobsOverview() {
  const { data: settings, isLoading, refetch, isFetching } = useSettingsData();

  const privacyLastRun = settings?.values.privacy.retentionLastRunAt;

  const resolveLastRun = (jobId: string) => {
    if (jobId === "privacy-retention") {
      return privacyLastRun
        ? new Date(privacyLastRun).toLocaleString("nl-NL", {
            dateStyle: "medium",
            timeStyle: "short",
            timeZone: "Europe/Amsterdam",
          })
        : "Not recorded yet";
    }
    return "Scheduled via QStash — check Upstash console for delivery history";
  };

  return (
    <div className="min-h-screen page-canvas">
      <div className="space-y-6">
        <PageHeader
          title="Background Jobs"
          description="Scheduled fulfilment and maintenance jobs with internal route endpoints."
          actions={[
            {
              label: isFetching ? "Refreshing…" : "Refresh",
              icon: <RefreshCw className="h-4 w-4" />,
              onClick: () => void refetch(),
              variant: "outline",
            },
          ]}
        />

        <OpsKpiGrid
          isLoading={isLoading}
          items={[
            {
              id: "total",
              label: "Registered jobs",
              value: OPS_JOB_DEFINITIONS.length,
            },
            {
              id: "qstash",
              label: "QStash schedules",
              value: OPS_JOB_DEFINITIONS.filter((job) => job.provider === "qstash")
                .length,
            },
            {
              id: "cron",
              label: "Vercel cron",
              value: OPS_JOB_DEFINITIONS.filter(
                (job) => job.provider === "vercel-cron",
              ).length,
            },
          ]}
        />

        <Card className="border-border">
          <CardHeader>
            <CardTitle className="text-xl font-bold">Job endpoints</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="pb-3 pr-4 font-medium">Job</th>
                    <th className="pb-3 pr-4 font-medium">Schedule</th>
                    <th className="pb-3 pr-4 font-medium">Provider</th>
                    <th className="pb-3 pr-4 font-medium">Last run</th>
                    <th className="pb-3 font-medium">Route</th>
                  </tr>
                </thead>
                <tbody>
                  {OPS_JOB_DEFINITIONS.map((job) => (
                    <tr
                      key={job.id}
                      className="border-b border-border/60 last:border-0"
                    >
                      <td className="py-3 pr-4">
                        <div className="font-medium text-foreground">
                          {job.name}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {job.description}
                        </div>
                      </td>
                      <td className="py-3 pr-4 text-muted-foreground">
                        {job.scheduleLabel}
                        <div className="font-mono text-[11px]">{job.schedule}</div>
                      </td>
                      <td className="py-3 pr-4">
                        <Badge variant="outline">{job.provider}</Badge>
                      </td>
                      <td className="py-3 pr-4 text-muted-foreground">
                        {resolveLastRun(job.id)}
                      </td>
                      <td className="py-3">
                        <Button asChild variant="outline" size="sm">
                          <Link href={job.path} target="_blank">
                            {job.path}
                            <ExternalLink className="ml-2 h-3.5 w-3.5" />
                          </Link>
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
