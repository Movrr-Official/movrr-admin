"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { Pie, PieChart, Cell } from "recharts";
import { Users } from "lucide-react";

interface RiderAllocationData {
  name: string;
  value: number;
  color: string;
}

interface CampaignRiderAllocationChartProps {
  data: RiderAllocationData[];
}

export function CampaignRiderAllocationChart({
  data = [],
}: CampaignRiderAllocationChartProps) {
  if (data.length === 0) {
    return (
      <Card className="glass-card border-0 animate-slide-up">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-4 w-4" />
            Rider Allocation
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-[200px] text-sm text-muted-foreground">
            No rider allocation data available
          </div>
        </CardContent>
      </Card>
    );
  }

  // Create chart config from data
  const chartConfig = data.reduce(
    (acc, item) => {
      acc[item.name.toLowerCase().replace(/\s+/g, "")] = {
        label: item.name,
        color: item.color,
      };
      return acc;
    },
    {} as Record<string, { label: string; color: string }>
  );

  return (
    <Card className="glass-card border-0 animate-slide-up">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Users className="h-4 w-4" />
          Rider Allocation
        </CardTitle>
      </CardHeader>
      <CardContent className="flex items-center justify-center">
        <div className="flex items-center justify-center gap-4 md:gap-6 h-[200px]">
          {/* Donut Chart */}
          <div className="flex-shrink-0 flex items-center justify-center">
            <ChartContainer
              config={chartConfig}
              className="h-[200px] w-[200px]"
            >
              <PieChart margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                <ChartTooltip
                  content={<ChartTooltipContent hideLabel />}
                />
                <Pie
                  data={data}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  innerRadius={50}
                  paddingAngle={2}
                >
                  {data.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
              </PieChart>
            </ChartContainer>
          </div>

          {/* Legend on the right */}
          <div className="flex flex-col gap-3">
            {data.map((item) => {
              const key = item.name.toLowerCase().replace(/\s+/g, "");
              const itemConfig = chartConfig[key];
              return (
                <div
                  key={item.name}
                  className="flex items-center gap-2"
                >
                  <div
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: item.color }}
                  />
                  <span className="text-sm text-muted-foreground">
                    <span className="font-medium">{itemConfig?.label || item.name}</span>
                    {": "}
                    <span className="font-semibold text-foreground">{item.value}</span>
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

