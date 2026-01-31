"use client";

import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface StatBadge {
  label: string;
  variant?: "default" | "outline" | "secondary" | "destructive";
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
  iconColor?: string;
}

export interface StatProgress {
  value: number; // 0-100
  label?: string;
  showLabel?: boolean;
}

export interface StatsCardProps {
  title: string;
  value: string | number;
  description?: string;
  icon?: LucideIcon;
  iconColor?: "blue" | "green" | "purple" | "amber" | "primary" | "red";
  iconBgColor?: "blue" | "green" | "purple" | "amber" | "primary" | "red";
  trend?: StatTrend;
  badges?: StatBadge[];
  metrics?: StatMetric[];
  progress?: StatProgress;
  className?: string;
  animationDelay?: string;
  valueSize?: "xs" | "sm" | "md" | "lg" | "xl";
  size?: "mini" | "compact" | "default" | "large";
  variant?: "default" | "gradient";
  formatValue?: (value: string | number) => string;
  onClick?: () => void;
}

const iconColorClasses = {
  blue: "text-blue-600 dark:text-blue-400",
  green: "text-green-600 dark:text-green-400",
  purple: "text-purple-600 dark:text-purple-400",
  amber: "text-amber-600 dark:text-amber-400",
  primary: "text-primary",
  red: "text-red-600 dark:text-red-400",
};

const iconBgClasses = {
  blue: "bg-blue-100 dark:bg-blue-950",
  green: "bg-green-100 dark:bg-green-950",
  purple: "bg-purple-100 dark:bg-purple-950",
  amber: "bg-amber-100 dark:bg-amber-950",
  primary: "bg-primary/10",
  red: "bg-red-100 dark:bg-red-950",
};

const gradientClasses = {
  blue: "from-blue-500/5",
  green: "from-green-500/5",
  purple: "from-purple-500/5",
  amber: "from-amber-500/5",
  primary: "from-primary/5",
  red: "from-red-500/5",
};

const valueSizeClasses = {
  xs: "text-lg md:text-xl",
  sm: "text-xl md:text-2xl",
  md: "text-2xl md:text-3xl",
  lg: "text-3xl md:text-4xl",
  xl: "text-4xl md:text-5xl",
};

export function StatsCard({
  title,
  value,
  description,
  icon: Icon,
  iconColor = "blue",
  iconBgColor,
  trend,
  badges,
  metrics,
  progress,
  className,
  animationDelay,
  valueSize,
  size = "default",
  variant = "default",
  formatValue,
  onClick,
}: StatsCardProps) {
  const effectiveIconBg = "primary";
  const effectiveIconColor = "primary";
  const isGradient = variant === "gradient";
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

  const TrendIcon = trend?.icon;
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
    mini: "text-[14px]",
    compact: "text-xs",
    default: "text-sm",
    large: "text-sm",
  };

  const iconWrapperSizeClasses = {
    mini: "p-2.5 rounded-lg",
    compact: "p-2 rounded-lg",
    default: "p-3 rounded-xl",
    large: "p-4 rounded-2xl",
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
        "border-0 transition-all duration-300 group animate-slide-up overflow-hidden relative",
        isGradient
          ? "bg-gradient-to-br from-primary to-primary/70 text-primary-foreground shadow-md"
          : "glass-card",
        onClick && "cursor-pointer hover:shadow-lg",
        cardSizeClasses[size],
        className,
      )}
      style={animationDelay ? { animationDelay } : undefined}
      onClick={onClick}
    >
      {!isGradient && (
        <div
          className={cn(
            "absolute inset-0 bg-gradient-to-br to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300",
            gradientClasses[effectiveIconBg],
          )}
        />
      )}
      <CardHeader className={cn("relative z-10", headerSizeClasses[size])}>
        <div className="flex items-center gap-3">
          {Icon && (
            <div
              className={cn(
                "group-hover:scale-110 group-hover:rotate-3 transition-all duration-300",
                isGradient
                  ? "bg-primary-foreground/15"
                  : iconBgClasses[effectiveIconBg],
                iconWrapperSizeClasses[size],
              )}
            >
              <Icon
                className={cn(
                  iconSizeClasses[size],
                  isGradient
                    ? "text-primary-foreground"
                    : iconColorClasses[effectiveIconColor],
                )}
              />
            </div>
          )}
          <div className="min-w-0">
            <CardTitle
              className={cn(
                isGradient
                  ? "font-semibold text-primary-foreground/80"
                  : "font-semibold text-muted-foreground",
                titleSizeClasses[size],
              )}
            >
              {title}
            </CardTitle>
            <div className="flex items-baseline gap-2">
              <div
                className={cn(
                  isGradient
                    ? "font-bold text-primary-foreground"
                    : "font-bold text-foreground",
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
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-red-600 dark:text-red-400",
                  )}
                >
                  {trend.type === "increase" ? "+" : "-"}
                  {trend.value}%
                </span>
              )}
            </div>
          </div>
        </div>
      </CardHeader>
      {hasContent && (
        <CardContent
          className={cn("relative z-10", contentPaddingClasses[size])}
        >
          {/* Description */}
          {description && (
            <p
              className={cn(
                "text-xs mb-1",
                isGradient
                  ? "text-primary-foreground/80"
                  : "text-muted-foreground",
              )}
            >
              {description}
            </p>
          )}

          {/* Progress Bar */}
          {progress && (
            <div className="mb-2">
              <div className="w-full bg-muted rounded-full h-2 overflow-hidden mb-2">
                <div
                  className="bg-gradient-to-r from-primary to-primary/80 h-2 rounded-full transition-all duration-1000 ease-out"
                  style={{
                    width: `${Math.min(100, Math.max(0, progress.value))}%`,
                  }}
                />
              </div>
              {progress.showLabel && progress.label && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-primary font-semibold">
                    {progress.label}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Multiple Metrics */}
          {metrics && metrics.length > 0 && (
            <div className="space-y-3 mb-2">
              {metrics.map((metric, index) => {
                const MetricIcon = metric.icon;
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
                            metric.iconColor || "text-primary",
                          )}
                        />
                      )}
                      <span className="text-sm font-medium text-foreground">
                        {metric.label}
                      </span>
                    </div>
                    <span className="text-lg font-bold text-foreground">
                      {typeof metric.value === "number"
                        ? metric.value.toLocaleString()
                        : metric.value}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Badges */}
          {badges && badges.length > 0 && (
            <div className="flex gap-1.5 flex-wrap">
              {badges.map((badge, index) => (
                <Badge
                  key={index}
                  variant={badge.variant || "outline"}
                  className={cn(
                    "text-xs font-medium",
                    isGradient &&
                      "bg-primary-foreground/15 text-primary-foreground border-primary-foreground/20",
                    badge.className,
                  )}
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
