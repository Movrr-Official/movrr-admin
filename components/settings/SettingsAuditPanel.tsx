"use client";

import { History } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { SettingsAuditEntry } from "@/schemas/settings";

type Props = {
  entries: SettingsAuditEntry[];
};

export function SettingsAuditPanel({ entries }: Props) {
  return (
    <Card className="glass-card border-0">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <History className="h-4 w-4" />
          Recent changes
        </CardTitle>
      </CardHeader>
      <CardContent>
        {entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No recent settings changes are visible in the current audit window.
          </p>
        ) : (
          <div className="space-y-4">
            {entries.map((entry) => (
              <div
                key={entry.id}
                className="rounded-xl border border-border/60 bg-background/40 p-4"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{entry.section.replaceAll("_", " ")}</Badge>
                  {entry.snapshotAvailable ? (
                    <Badge variant="secondary">Snapshot captured</Badge>
                  ) : null}
                </div>
                <div className="mt-2 text-sm font-medium text-foreground">
                  {entry.changedFields.length > 0
                    ? `Changed: ${entry.changedFields.join(", ")}`
                    : entry.action}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {entry.performedBy.name} ({entry.performedBy.email}) •{" "}
                  {new Date(entry.timestamp).toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
