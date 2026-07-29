"use client";

import { Badge } from "@/components/ui/badge";
import {
  formatFulfilmentType,
  getFulfilmentTypePresentation,
} from "@/features/fulfilment/presentation";
import { cn } from "@/lib/utils";

type FulfilmentTypeBadgeProps = {
  type: string | null | undefined;
  className?: string;
  showIcon?: boolean;
};

export function FulfilmentTypeBadge({
  type,
  className,
  showIcon = false,
}: FulfilmentTypeBadgeProps) {
  const presentation = getFulfilmentTypePresentation(type);
  const Icon = presentation.icon;

  return (
    <Badge variant={presentation.badgeVariant} className={cn(className)}>
      {showIcon && Icon ? <Icon className="size-3" aria-hidden="true" /> : null}
      {formatFulfilmentType(type)}
    </Badge>
  );
}
