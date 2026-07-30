"use client";

import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { AlertTriangle, Plus } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { OpsEmptyState } from "@/components/ops/OpsEmptyState";
import { OpsErrorState } from "@/components/ops/OpsEmptyState";
import { OpsKpiGrid } from "@/components/ops/OpsKpiGrid";
import {
  useCreateIncident,
  useIncidentsData,
  useUpdateIncidentStatus,
} from "@/hooks/useIncidentsData";
import { useToast } from "@/hooks/useToast";
import type {
  IncidentSeverity,
  IncidentStatus,
} from "@/features/incidents/types";

const severityTone = (
  severity: IncidentSeverity,
): "default" | "warning" | "danger" => {
  if (severity === "critical" || severity === "high") return "danger";
  if (severity === "medium") return "warning";
  return "default";
};

const statusVariant = (status: IncidentStatus) => {
  switch (status) {
    case "open":
      return "destructive" as const;
    case "investigating":
      return "warning" as const;
    case "resolved":
      return "success" as const;
    default:
      return "secondary" as const;
  }
};

export default function IncidentsOverview() {
  const { toast } = useToast();
  const { data, isLoading, isError, error, refetch, isFetching } =
    useIncidentsData();
  const createIncident = useCreateIncident();
  const updateStatus = useUpdateIncidentStatus();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState<IncidentSeverity>("medium");

  const incidents = data ?? [];
  const openCount = incidents.filter(
    (incident) =>
      incident.status === "open" || incident.status === "investigating",
  ).length;

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      await createIncident.mutateAsync({ title, description, severity });
      toast({ title: "Incident created" });
      setTitle("");
      setDescription("");
      setSeverity("medium");
    } catch (err) {
      toast({
        title: "Could not create incident",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    }
  };

  const handleStatusChange = async (id: string, status: IncidentStatus) => {
    try {
      await updateStatus.mutateAsync({ id, status });
      toast({ title: "Incident updated" });
    } catch (err) {
      toast({
        title: "Update failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="min-h-screen page-canvas">
      <div className="space-y-6">
        <PageHeader
          title="Incidents"
          description="Track operational incidents and investigation status."
          actions={[
            {
              label: isFetching ? "Refreshing…" : "Refresh",
              onClick: () => void refetch(),
              variant: "outline",
            },
          ]}
        />

        <OpsKpiGrid
          isLoading={isLoading}
          items={[
            { id: "total", label: "Total", value: incidents.length },
            {
              id: "open",
              label: "Open / investigating",
              value: openCount,
              tone: openCount > 0 ? "warning" : "default",
            },
            {
              id: "resolved",
              label: "Resolved",
              value: incidents.filter((i) => i.status === "resolved").length,
              tone: "success",
            },
          ]}
        />

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <Card className="border-border lg:col-span-5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Plus className="h-4 w-4" />
                Log incident
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form className="space-y-4" onSubmit={handleCreate}>
                <div className="space-y-2">
                  <Label htmlFor="incident-title">Title</Label>
                  <Input
                    id="incident-title"
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    placeholder="Brief summary"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="incident-description">Description</Label>
                  <Textarea
                    id="incident-description"
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    placeholder="Impact, scope, and current mitigation"
                    rows={4}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Severity</Label>
                  <Select
                    value={severity}
                    onValueChange={(value) =>
                      setSeverity(value as IncidentSeverity)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="critical">Critical</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button type="submit" disabled={createIncident.isPending}>
                  {createIncident.isPending ? "Creating…" : "Create incident"}
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card className="border-border lg:col-span-7">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <AlertTriangle className="h-4 w-4" />
                Incident log
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <p className="text-sm text-muted-foreground">Loading incidents…</p>
              ) : isError ? (
                <OpsErrorState
                  message={error?.message ?? "Failed to load incidents"}
                  onRetry={() => void refetch()}
                />
              ) : incidents.length === 0 ? (
                <OpsEmptyState
                  title="No incidents logged"
                  description="Create an incident when operational issues need tracking."
                />
              ) : (
                <div className="space-y-3">
                  {incidents.map((incident) => (
                    <div
                      key={incident.id}
                      className="rounded-xl border border-border/60 bg-background/40 p-4"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-semibold text-foreground">
                              {incident.title}
                            </p>
                            <Badge variant={statusVariant(incident.status)}>
                              {incident.status}
                            </Badge>
                            <Badge
                              variant="outline"
                              className={severityTone(incident.severity) === "danger" ? "border-destructive text-destructive" : undefined}
                            >
                              {incident.severity}
                            </Badge>
                          </div>
                          <p className="mt-2 text-sm text-muted-foreground">
                            {incident.description}
                          </p>
                          <p className="mt-2 text-xs text-muted-foreground">
                            Updated{" "}
                            {formatDistanceToNow(new Date(incident.updatedAt), {
                              addSuffix: true,
                            })}
                            {incident.createdBy
                              ? ` · ${incident.createdBy}`
                              : ""}
                          </p>
                        </div>
                        <Select
                          value={incident.status}
                          onValueChange={(value) =>
                            void handleStatusChange(
                              incident.id,
                              value as IncidentStatus,
                            )
                          }
                        >
                          <SelectTrigger className="w-[160px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="open">Open</SelectItem>
                            <SelectItem value="investigating">
                              Investigating
                            </SelectItem>
                            <SelectItem value="resolved">Resolved</SelectItem>
                            <SelectItem value="closed">Closed</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
