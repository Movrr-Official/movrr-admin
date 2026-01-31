"use client";

import React from "react";
import { TooltipProps } from "recharts";
import {
  ValueType,
  NameType,
} from "recharts/types/component/DefaultTooltipContent";

export function ChartTooltipContent({
  active,
  payload,
  label,
}: TooltipProps<ValueType, NameType>) {
  if (!active || !payload || !payload.length) return null;

  return (
    <div className="rounded-md border bg-background px-4 py-2 shadow-md text-sm">
      <p className="text-muted-foreground mb-1 font-medium">
        {typeof label === "string" && label.startsWith("Day")
          ? label
          : `Day: ${label}`}
      </p>
      {payload.map((entry, index) => (
        <p
          key={index}
          className="flex items-center gap-2"
          style={{ color: entry.color }}
        >
          <span className="font-medium">{entry.name ?? "Value"}:</span>
          <span className="font-semibold">
            {typeof entry.value === "number"
              ? entry.value.toLocaleString()
              : entry.value}
          </span>
        </p>
      ))}
    </div>
  );
}
