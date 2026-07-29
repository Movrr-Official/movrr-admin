"use client";

import { Loader2 } from "lucide-react";
import type { FulfilmentEvent } from "@/features/fulfilment/domain/Fulfilment";
import { formatFulfilmentState } from "@/features/fulfilment/presentation";

type FulfilmentTimelineProps = {
  events: FulfilmentEvent[];
  isLoading: boolean;
};

export function FulfilmentTimeline({
  events,
  isLoading,
}: FulfilmentTimelineProps) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin mr-2" />
        Loading timeline…
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <p className="py-6 text-sm text-muted-foreground">
        No timeline events recorded.
      </p>
    );
  }

  const ordered = [...events].sort(
    (a, b) =>
      new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime(),
  );

  return (
    <ol className="space-y-3 border-l border-border pl-4">
      {ordered.map((event) => (
        <li key={event.id} className="relative">
          <span className="absolute -left-[1.3rem] top-1.5 h-2.5 w-2.5 rounded-full bg-primary" />
          <div className="space-y-0.5">
            <p className="text-sm font-medium">
              {formatFulfilmentState(event.fromState)} →{" "}
              {formatFulfilmentState(event.toState)}
            </p>
            <p className="text-xs text-muted-foreground">{event.reason}</p>
            <p className="text-xs font-mono text-muted-foreground">
              {new Date(event.occurredAt).toLocaleString()}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}
