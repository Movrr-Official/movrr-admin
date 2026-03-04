"use client";

import React from "react";
import { TooltipProps } from "recharts";
import {
  ValueType,
  NameType,
} from "recharts/types/component/DefaultTooltipContent";
import { formatCurrencyEUR, formatCurrencyEURWithPrecision } from "@/lib/currency";

type TooltipEntry = {
  name?: unknown;
  dataKey?: unknown;
  payload?: Record<string, unknown>;
};

type ChartTooltipContentProps = TooltipProps<ValueType, NameType> & {
  seriesLabelMap?: Record<string, string>;
  seriesFormatMap?: Record<
    string,
    "number" | "currency" | "currency-4" | "percent"
  >;
};

function resolveRawSeriesKey(entry: TooltipEntry): string {
  const direct = String(entry.name ?? entry.dataKey ?? "").trim();
  if (direct) return direct;

  const payload = entry.payload;
  if (payload && typeof payload === "object") {
    const candidate = Object.keys(payload).find((key) => {
      if (key === "name") return false;
      const value = payload[key];
      return typeof value === "number";
    });
    if (candidate) return candidate;
  }

  return "value";
}

function isCurrencySeries(entry: TooltipEntry): boolean {
  const label = resolveRawSeriesKey(entry).toLowerCase();
  return ["revenue", "budget", "spent", "cost", "amount"].some((token) =>
    label.includes(token),
  );
}

function usesFineCurrencyPrecision(entry: TooltipEntry): boolean {
  const label = resolveRawSeriesKey(entry).toLowerCase();
  return ["cpi", "cpm"].some((token) => label.includes(token));
}

function formatSeriesLabel(
  entry: TooltipEntry,
  seriesLabelMap?: Record<string, string>,
): string {
  const rawKey = resolveRawSeriesKey(entry);
  const mapped = seriesLabelMap?.[rawKey];
  if (mapped) return mapped;

  const upperAcronyms = new Set(["cpi", "cpm", "ctr", "roi", "api", "kpi"]);
  return rawKey
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .split(/\s+/)
    .map((word) => {
      const lower = word.toLowerCase();
      if (upperAcronyms.has(lower)) return lower.toUpperCase();
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(" ");
}

function formatTooltipHeader(label: unknown): string {
  if (typeof label !== "string") {
    return label !== undefined && label !== null ? String(label) : "Details";
  }
  const trimmed = label.trim();
  if (!trimmed) return "Details";

  return trimmed
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .split(/\s+/)
    .map((word) =>
      word.length <= 2
        ? word.toUpperCase()
        : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase(),
    )
    .join(" ");
}

export function ChartTooltipContent({
  active,
  payload,
  label,
  seriesLabelMap,
  seriesFormatMap,
}: ChartTooltipContentProps) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="rounded-md border bg-background px-4 py-2 shadow-md text-sm">
      <p className="text-muted-foreground mb-1 font-medium">
        {formatTooltipHeader(label)}
      </p>
      {payload.map((entry, index) => (
        <p
          key={index}
          className="flex items-center gap-2"
          style={{ color: entry.color }}
        >
          <span className="font-medium">
            {formatSeriesLabel(entry, seriesLabelMap)}:
          </span>
          <span className="font-semibold">
            {typeof entry.value === "number" ? (() => {
              const seriesKey = resolveRawSeriesKey(entry);
              const explicitFormat = seriesFormatMap?.[seriesKey];
              if (explicitFormat === "currency-4") {
                return formatCurrencyEURWithPrecision(entry.value, 4);
              }
              if (explicitFormat === "currency") {
                return formatCurrencyEUR(entry.value);
              }
              if (explicitFormat === "number") {
                return entry.value.toLocaleString();
              }
              if (explicitFormat === "percent") {
                return `${entry.value.toLocaleString()}%`;
              }

              if (isCurrencySeries(entry)) {
                return usesFineCurrencyPrecision(entry)
                  ? formatCurrencyEURWithPrecision(entry.value, 4)
                  : formatCurrencyEUR(entry.value);
              }

              return entry.value.toLocaleString();
            })() : entry.value}
          </span>
        </p>
      ))}
    </div>
  );
}
