"use client";

import type { ReactNode } from "react";
import { AlertCircle, Inbox } from "lucide-react";
import { Button } from "@/components/ui/button";

type OpsEmptyStateProps = {
  title: string;
  description: string;
  action?: ReactNode;
};

export function OpsEmptyState({
  title,
  description,
  action,
}: OpsEmptyStateProps) {
  return (
    <div
      className="flex flex-col items-center justify-center gap-3 py-14 text-center"
      role="status"
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
        <Inbox className="h-5 w-5 text-muted-foreground" aria-hidden />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        <p className="max-w-md text-sm text-muted-foreground">{description}</p>
      </div>
      {action}
    </div>
  );
}

type OpsErrorStateProps = {
  title?: string;
  message: string;
  onRetry?: () => void;
};

export function OpsErrorState({
  title = "Something went wrong",
  message,
  onRetry,
}: OpsErrorStateProps) {
  return (
    <div
      className="flex flex-col items-center justify-center gap-3 py-14 text-center"
      role="alert"
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
        <AlertCircle className="h-5 w-5 text-destructive" aria-hidden />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        <p className="max-w-md text-sm text-destructive">{message}</p>
      </div>
      {onRetry ? (
        <Button type="button" variant="outline" size="sm" onClick={onRetry}>
          Retry
        </Button>
      ) : null}
    </div>
  );
}
