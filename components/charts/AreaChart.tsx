"use client";

import {
  XAxis,
  CartesianGrid,
  ResponsiveContainer,
  AreaChart as RechartsAreaChart,
  Area,
  YAxis,
  Tooltip,
} from "recharts";
import { PerformanceChartProps } from "@/types/types";
import { ChartTooltipContent } from "./ChartTooltipContent";

const AreaChart = ({ data = [] }: PerformanceChartProps) => {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <RechartsAreaChart accessibilityLayer data={data}>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="name"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          tickFormatter={(value) => value.slice(0, 3)}
        />
        <YAxis tickLine={false} axisLine={false} tickMargin={8} tickCount={3} />
        <Tooltip content={<ChartTooltipContent />} />
        <defs>
          <linearGradient id="fillImpressions" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--chart-1)" stopOpacity={0.8} />
            <stop offset="95%" stopColor="var(--chart-1)" stopOpacity={0.1} />
          </linearGradient>
          <linearGradient id="fillRevenue" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--chart-2)" stopOpacity={0.8} />
            <stop offset="95%" stopColor="var(--chart-2)" stopOpacity={0.1} />
          </linearGradient>
        </defs>
        <Area
          dataKey="impressions"
          type="natural"
          fill="url(#fillImpressions)"
          stroke="var(--chart-1)"
          strokeWidth={2}
          stackId="a"
          name="Impressions"
        />
        <Area
          dataKey="revenue"
          type="natural"
          fill="url(#fillRevenue)"
          stroke="var(--chart-2)"
          strokeWidth={2}
          stackId="a"
          name="Revenue (€)"
        />
      </RechartsAreaChart>
    </ResponsiveContainer>
  );
};

export default AreaChart;
