"use client";

import {
  XAxis,
  CartesianGrid,
  ResponsiveContainer,
  LineChart,
  Line,
  Tooltip,
  YAxis,
} from "recharts";
import { PerformanceChartProps } from "@/types/types";
import { ChartTooltipContent } from "./ChartTooltipContent";

const LineChartComponent = ({ data = [] }: PerformanceChartProps) => {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart accessibilityLayer data={data}>
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
        <Line
          dataKey="impressions"
          type="natural"
          stroke="var(--chart-1)"
          strokeWidth={2}
          dot={false}
          name="Impressions"
        />
        <Line
          dataKey="revenue"
          type="natural"
          stroke="var(--chart-2)"
          strokeWidth={2}
          dot={false}
          name="Revenue (€)"
        />
      </LineChart>
    </ResponsiveContainer>
  );
};

export default LineChartComponent;
