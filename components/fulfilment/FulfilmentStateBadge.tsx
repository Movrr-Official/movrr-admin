"use client";

import { Badge } from "@/components/ui/badge";
import {
  formatFulfilmentState,
  getFulfilmentStatePresentation,
} from "@/features/fulfilment/presentation";
import { cn } from "@/lib/utils";

type FulfilmentStateBadgeProps = {
  state: string | null | undefined;
  className?: string;
  /** Show icon when presentation defines one. */
  showIcon?: boolean;
};

export function FulfilmentStateBadge({
  state,
  className,
  showIcon = false,
}: FulfilmentStateBadgeProps) {
  const presentation = getFulfilmentStatePresentation(state);
  const Icon = presentation.icon;

  return (
    <Badge variant={presentation.badgeVariant} className={cn(className)}>
      {showIcon && Icon ? <Icon className="size-3" aria-hidden="true" /> : null}
      {formatFulfilmentState(state)}
    </Badge>
  );
}
