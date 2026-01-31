"use client";

import {
  XAxis,
  CartesianGrid,
  ResponsiveContainer,
  BarChart,
  Bar,
  Tooltip,
  YAxis,
} from "recharts";
import { PerformanceChartProps } from "@/types/types";
import { ChartTooltipContent } from "./ChartTooltipContent";

const BarChartComponent = ({ data = [] }: PerformanceChartProps) => {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart accessibilityLayer data={data}>
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
        <Bar
          dataKey="impressions"
          fill="var(--chart-1)"
          radius={[4, 4, 0, 0]}
          name="Impressions"
        />
        <Bar
          dataKey="revenue"
          fill="var(--chart-2)"
          radius={[4, 4, 0, 0]}
          name="Revenue (€)"
        />
      </BarChart>
    </ResponsiveContainer>
  );
};

export default BarChartComponent;
