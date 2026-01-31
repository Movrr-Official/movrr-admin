"use client";

import React, { useMemo, useState } from "react";
import {
  Label,
  Pie,
  PieChart,
  ResponsiveContainer,
  Sector,
  Tooltip,
} from "recharts";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { chartConfig } from "./config/chartConfig";
import { PieSectorDataItem } from "recharts/types/polar/Pie";
import { ChartStyle } from "@/components/ui/chart";
import { ChartTooltipContent } from "./ChartTooltipContent";

const data = [
  { month: "january", riders: 186, fill: "var(--chart-1)" },
  { month: "february", riders: 305, fill: "var(--chart-2)" },
  { month: "march", riders: 237, fill: "var(--chart-3)" },
  { month: "april", riders: 173, fill: "var(--chart-4)" },
  { month: "may", riders: 209, fill: "var(--chart-5)" },
];

const InteractivePieChart = () => {
  const id = "pie-interactive";
  const [activeMonth, setActiveMonth] = useState(data[0]?.month);
  const activeIndex = useMemo(
    () => data.findIndex((item) => item.month === activeMonth),
    [activeMonth]
  );
  const months = useMemo(() => data.map((item) => item.month), []);

  return (
    <div className="h-full w-full">
      <ChartStyle id={id} config={chartConfig} />
      <div className="mb-4">
        <Select value={activeMonth} onValueChange={setActiveMonth}>
          <SelectTrigger
            className="ml-auto h-7 w-[130px] rounded-lg pl-2.5"
            aria-label="Select a value"
          >
            <SelectValue placeholder="Select month" />
          </SelectTrigger>
          <SelectContent align="end" className="rounded-xl">
            {months.map((key) => {
              const config = chartConfig[key as keyof typeof chartConfig];
              if (!config) {
                return null;
              }
              return (
                <SelectItem
                  key={key}
                  value={key}
                  className="rounded-lg [&_span]:flex"
                >
                  <div className="flex items-center gap-2 text-xs">
                    <span
                      className="flex h-3 w-3 shrink-0 rounded-xs"
                      style={{
                        backgroundColor: `var(--color-${key})`,
                      }}
                    />
                    {config?.label}
                  </div>
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
      </div>
      <div className="h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart accessibilityLayer data={data}>
            <Tooltip content={<ChartTooltipContent />} />
            <Pie
              data={data}
              dataKey="riders"
              nameKey="name"
              innerRadius={60}
              strokeWidth={5}
              activeIndex={activeIndex}
              activeShape={({
                outerRadius = 0,
                ...props
              }: PieSectorDataItem) => (
                <g>
                  <Sector {...props} outerRadius={outerRadius + 10} />
                  <Sector
                    {...props}
                    outerRadius={outerRadius + 25}
                    innerRadius={outerRadius + 12}
                  />
                </g>
              )}
            >
              <Label
                content={({ viewBox }) => {
                  if (viewBox && "cx" in viewBox && "cy" in viewBox) {
                    return (
                      <text
                        x={viewBox.cx}
                        y={viewBox.cy}
                        textAnchor="middle"
                        dominantBaseline="middle"
                      >
                        <tspan
                          x={viewBox.cx}
                          y={viewBox.cy}
                          className="fill-foreground text-3xl font-bold"
                        >
                          {(data[activeIndex]?.riders ?? 0).toLocaleString()}
                        </tspan>
                        <tspan
                          x={viewBox.cx}
                          y={(viewBox.cy || 0) + 24}
                          className="fill-muted-foreground"
                        >
                          Riders
                        </tspan>
                      </text>
                    );
                  }
                }}
              />
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default InteractivePieChart;
