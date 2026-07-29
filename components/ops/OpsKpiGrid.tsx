"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export type OpsKpiItem = {
  id: string;
  label: string;
  value: number | string;
  hint?: string;
  tone?: "default" | "success" | "warning" | "danger" | "muted";
};

type OpsKpiGridProps = {
  title?: string;
  description?: string;
  items: OpsKpiItem[];
  isLoading?: boolean;
  className?: string;
};

const toneClass: Record<NonNullable<OpsKpiItem["tone"]>, string> = {
  default: "text-foreground",
  success: "text-emerald-700 dark:text-emerald-400",
  warning: "text-amber-700 dark:text-amber-400",
  danger: "text-destructive",
  muted: "text-muted-foreground",
};

export function OpsKpiGrid({
  title,
  description,
  items,
  isLoading,
  className,
}: OpsKpiGridProps) {
  return (
    <Card className={cn("border-border", className)}>
      {(title || description) && (
        <CardHeader className="pb-2">
          {title ? <CardTitle className="text-lg">{title}</CardTitle> : null}
          {description ? (
            <p className="text-sm text-muted-foreground">{description}</p>
          ) : null}
        </CardHeader>
      )}
      <CardContent>
        <div
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
          role="group"
          aria-label={title ?? "Operational metrics"}
        >
          {isLoading
            ? Array.from({ length: Math.max(items.length, 4) }).map((_, i) => (
                <div
                  key={`skel-${i}`}
                  className="rounded-xl border border-border/60 bg-muted/20 p-4"
                >
                  <Skeleton className="mb-2 h-3 w-20" />
                  <Skeleton className="h-7 w-12" />
                </div>
              ))
            : items.map((item) => (
                <div
                  key={item.id}
                  className="rounded-xl border border-border/60 bg-background/60 p-4"
                >
                  <p className="text-xs font-medium text-muted-foreground">
                    {item.label}
                  </p>
                  <p
                    className={cn(
                      "mt-1 text-2xl font-semibold tracking-tight",
                      toneClass[item.tone ?? "default"],
                    )}
                  >
                    {item.value}
                  </p>
                  {item.hint ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {item.hint}
                    </p>
                  ) : null}
                </div>
              ))}
        </div>
      </CardContent>
    </Card>
  );
}
