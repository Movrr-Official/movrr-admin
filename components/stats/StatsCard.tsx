"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type StatsCardAccent =
  | "primary"
  | "success"
  | "warning"
  | "destructive"
  | "muted"
  // Legacy aliases mapped to semantic accents
  | "blue"
  | "green"
  | "purple"
  | "amber"
  | "red";

type SemanticAccent = "primary" | "success" | "warning" | "destructive" | "muted";

export interface StatBadge {
  label: string;
  variant?:
    | "default"
    | "outline"
    | "secondary"
    | "destructive"
    | "success"
    | "info"
    | "warning"
    | "accent";
  className?: string;
}

export interface StatTrend {
  value: number;
  type: "increase" | "decrease";
  label?: string;
  icon?: LucideIcon;
}

export interface StatMetric {
  label: string;
  value: string | number;
  icon?: LucideIcon;
  iconColor?: StatsCardAccent | string;
}

export interface StatProgress {
  value: number;
  label?: string;
  showLabel?: boolean;
}

export interface StatsCardProps {
  title: string;
  value: string | number;
  description?: string;
  icon?: LucideIcon;
  iconColor?: StatsCardAccent;
  iconBgColor?: StatsCardAccent;
  trend?: StatTrend;
  badges?: StatBadge[];
  metrics?: StatMetric[];
  progress?: StatProgress;
  className?: string;
  animationDelay?: string;
  valueSize?: "xs" | "sm" | "md" | "lg" | "xl";
  size?: "mini" | "compact" | "default" | "large";
  /** @deprecated Gradient chrome removed; prop kept for call-site compatibility */
  variant?: "default" | "gradient";
  formatValue?: (value: string | number) => string;
  onClick?: () => void;
}

const accentAlias: Record<string, SemanticAccent> = {
  primary: "primary",
  success: "success",
  warning: "warning",
  destructive: "destructive",
  muted: "muted",
  blue: "primary",
  green: "success",
  purple: "muted",
  amber: "warning",
  red: "destructive",
};

const iconColorClasses: Record<SemanticAccent, string> = {
  primary: "text-primary",
  success: "text-success",
  warning: "text-warning",
  destructive: "text-destructive",
  muted: "text-muted-foreground",
};

const iconBgClasses: Record<SemanticAccent, string> = {
  primary: "bg-primary/10",
  success: "bg-success/10",
  warning: "bg-warning/15",
  destructive: "bg-destructive/10",
  muted: "bg-muted",
};

const valueSizeClasses = {
  xs: "text-lg md:text-xl",
  sm: "text-xl md:text-2xl",
  md: "text-2xl md:text-3xl",
  lg: "text-3xl md:text-4xl",
  xl: "text-4xl md:text-5xl",
};

function resolveAccent(value?: StatsCardAccent | string): SemanticAccent {
  if (!value) return "primary";
  return accentAlias[value] ?? "primary";
}

export function StatsCard({
  title,
  value,
  description,
  icon: Icon,
  iconColor = "primary",
  iconBgColor,
  trend,
  badges,
  metrics,
  progress,
  className,
  animationDelay,
  valueSize,
  size = "default",
  formatValue,
  onClick,
}: StatsCardProps) {
  const resolvedIcon = resolveAccent(iconColor);
  const resolvedBg = resolveAccent(iconBgColor ?? iconColor);
  const formattedValue = formatValue
    ? formatValue(value)
    : typeof value === "number"
      ? value.toLocaleString()
      : value;
  const effectiveValueSize =
    valueSize ||
    (size === "mini"
      ? "sm"
      : size === "compact"
        ? "sm"
        : size === "large"
          ? "xl"
          : "lg");

  const hasContent = Boolean(
    description ||
      progress ||
      (metrics && metrics.length > 0) ||
      (badges && badges.length > 0),
  );

  const cardSizeClasses = {
    mini: "py-4 gap-4",
    compact: "",
    default: "",
    large: "",
  };

  const headerSizeClasses = {
    mini: "pb-0 px-4",
    compact: "pb-2",
    default: "pb-3",
    large: "pb-4",
  };

  const titleSizeClasses = {
    mini: "text-sm",
    compact: "text-xs",
    default: "text-sm",
    large: "text-sm",
  };

  const iconWrapperSizeClasses = {
    mini: "p-2.5 rounded-[14px]",
    compact: "p-2 rounded-[14px]",
    default: "p-3 rounded-[14px]",
    large: "p-4 rounded-[14px]",
  };

  const iconSizeClasses = {
    mini: "h-5 w-5",
    compact: "h-4 w-4",
    default: "h-5 w-5",
    large: "h-6 w-6",
  };

  const contentPaddingClasses = {
    mini: "px-4 pb-5",
    compact: "",
    default: "",
    large: "",
  };

  return (
    <Card
      className={cn(
        "relative overflow-hidden border border-border bg-card transition-shadow duration-200",
        onClick && "cursor-pointer hover:shadow-sm",
        cardSizeClasses[size],
        className,
      )}
      style={animationDelay ? { animationDelay } : undefined}
      onClick={onClick}
    >
      <CardHeader className={cn(headerSizeClasses[size])}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle
              className={cn(
                "font-semibold text-muted-foreground",
                titleSizeClasses[size],
              )}
            >
              {title}
            </CardTitle>
            <div className="flex items-baseline gap-2">
              <div
                className={cn(
                  "font-semibold tracking-tight text-foreground",
                  valueSizeClasses[effectiveValueSize],
                )}
              >
                {formattedValue}
              </div>
              {trend && (
                <span
                  className={cn(
                    "text-xs font-semibold",
                    trend.type === "increase"
                      ? "text-success"
                      : "text-destructive",
                  )}
                >
                  {trend.type === "increase" ? "+" : "-"}
                  {trend.value}%
                </span>
              )}
            </div>
          </div>
          {Icon && (
            <div
              className={cn(
                iconBgClasses[resolvedBg],
                iconWrapperSizeClasses[size],
              )}
            >
              <Icon
                className={cn(
                  iconSizeClasses[size],
                  iconColorClasses[resolvedIcon],
                )}
              />
            </div>
          )}
        </div>
      </CardHeader>
      {hasContent && (
        <CardContent className={cn(contentPaddingClasses[size])}>
          {description && (
            <p className="mb-1 text-xs text-muted-foreground">{description}</p>
          )}

          {progress && (
            <div className="mb-2">
              <div className="mb-2 h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-2 rounded-full bg-primary transition-all duration-500 ease-out"
                  style={{
                    width: `${Math.min(100, Math.max(0, progress.value))}%`,
                  }}
                />
              </div>
              {progress.showLabel && progress.label && (
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-primary">
                    {progress.label}
                  </span>
                </div>
              )}
            </div>
          )}

          {metrics && metrics.length > 0 && (
            <div className="mb-2 space-y-3">
              {metrics.map((metric, index) => {
                const MetricIcon = metric.icon;
                const metricAccent = resolveAccent(metric.iconColor);
                return (
                  <div
                    key={index}
                    className="flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2">
                      {MetricIcon && (
                        <MetricIcon
                          className={cn(
                            "h-4 w-4",
                            iconColorClasses[metricAccent],
                          )}
                        />
                      )}
                      <span className="text-sm font-medium text-foreground">
                        {metric.label}
                      </span>
                    </div>
                    <span className="text-lg font-semibold text-foreground">
                      {typeof metric.value === "number"
                        ? metric.value.toLocaleString()
                        : metric.value}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {badges && badges.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {badges.map((badge, index) => (
                <Badge
                  key={index}
                  variant={badge.variant || "outline"}
                  className={cn("text-xs font-medium", badge.className)}
                >
                  {badge.label}
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
