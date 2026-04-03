"use client";

import { History } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { SettingsAuditEntry } from "@/schemas/settings";

type Props = {
  entries: SettingsAuditEntry[];
};

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "on" : "off";
  if (Array.isArray(value)) {
    if (value.length === 0) return "(empty)";
    return value.join(", ");
  }
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

type FieldDiff = {
  field: string;
  from: string;
  to: string;
};

function buildFieldDiffs(entry: SettingsAuditEntry): FieldDiff[] {
  if (!entry.changedFields.length) return [];

  return entry.changedFields.map((field) => ({
    field,
    from: formatValue(entry.previousValue?.[field]),
    to: formatValue(entry.newValue?.[field]),
  }));
}

function humanize(key: string): string {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (c) => c.toUpperCase())
    .trim();
}

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
            {entries.map((entry) => {
              const diffs = buildFieldDiffs(entry);
              const hasDiffs =
                diffs.length > 0 &&
                (entry.previousValue !== undefined ||
                  entry.newValue !== undefined);

              return (
                <div
                  key={entry.id}
                  className="rounded-xl border border-border/60 bg-background/40 p-4"
                >
                  {/* Header row */}
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">
                      {entry.section.replaceAll("_", " ")}
                    </Badge>
                    {entry.snapshotAvailable ? (
                      <Badge variant="secondary">Snapshot</Badge>
                    ) : null}
                  </div>

                  {/* Field-level diffs */}
                  {hasDiffs ? (
                    <div className="mt-3 space-y-1.5">
                      {diffs.map(({ field, from, to }) => (
                        <div
                          key={field}
                          className="grid grid-cols-[140px_1fr] gap-x-3 text-xs"
                        >
                          <span className="truncate font-medium text-foreground/70">
                            {humanize(field)}
                          </span>
                          <span className="flex min-w-0 items-center gap-1.5">
                            <span className="truncate rounded bg-destructive/10 px-1.5 py-0.5 font-mono text-destructive/80 line-through">
                              {from}
                            </span>
                            <span className="shrink-0 text-muted-foreground">
                              →
                            </span>
                            <span className="truncate rounded bg-green-500/10 px-1.5 py-0.5 font-mono text-green-600 dark:text-green-400">
                              {to}
                            </span>
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="mt-2 text-sm font-medium text-foreground">
                      {entry.changedFields.length > 0
                        ? `Changed: ${entry.changedFields.join(", ")}`
                        : entry.action}
                    </div>
                  )}

                  {/* Actor + timestamp */}
                  <div className="mt-2 text-xs text-muted-foreground">
                    {entry.performedBy.name} ({entry.performedBy.email}) •{" "}
                    {new Date(entry.timestamp).toLocaleString()}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
