"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import {
  Area,
  AreaChart,
  CartesianGrid,
  XAxis,
  YAxis,
} from "recharts";
import { Calendar } from "lucide-react";

interface DailyImpressionData {
  date: string;
  impressions: number;
}

interface CampaignDailyImpressionsChartProps {
  data: DailyImpressionData[];
}

const chartConfig = {
  impressions: {
    label: "Impressions",
    color: "hsl(270, 90%, 65%)",
  },
} satisfies Record<string, { label: string; color: string }>;

export function CampaignDailyImpressionsChart({
  data = [],
}: CampaignDailyImpressionsChartProps) {
  if (data.length === 0) {
    return (
      <Card className="glass-card border-0 animate-slide-up">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Daily Impressions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-[200px] text-sm text-muted-foreground">
            No impressions data available
          </div>
        </CardContent>
      </Card>
    );
  }

  // Calculate total for display
  const totalImpressions = data.reduce(
    (sum, item) => sum + item.impressions,
    0
  );

  return (
    <Card className="glass-card border-0 animate-slide-up">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            Daily Impressions
          </CardTitle>
          <div className="text-xs text-muted-foreground">
            {totalImpressions.toLocaleString()}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="h-[200px] w-full">
          <AreaChart
            accessibilityLayer
            data={data}
            margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
          >
            <defs>
              <linearGradient id="fillImpressions" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="5%"
                  stopColor="var(--color-impressions)"
                  stopOpacity={0.8}
                />
                <stop
                  offset="95%"
                  stopColor="var(--color-impressions)"
                  stopOpacity={0.1}
                />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="date"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              tickFormatter={(value) => {
                if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
                return value.toString();
              }}
            />
            <ChartTooltip
              cursor={false}
              content={<ChartTooltipContent indicator="line" />}
            />
            <Area
              dataKey="impressions"
              type="monotone"
              fill="url(#fillImpressions)"
              fillOpacity={0.4}
              stroke="var(--color-impressions)"
              strokeWidth={2}
            />
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
