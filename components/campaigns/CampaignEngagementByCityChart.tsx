"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { MapPin } from "lucide-react";

interface EngagementByCityData {
  city: string;
  engagement: number;
  campaigns: number;
}

interface CampaignEngagementByCityChartProps {
  data: EngagementByCityData[];
}

const chartConfig = {
  engagement: {
    label: "Engagement",
    color: "hsl(210, 100%, 56%)",
  },
} satisfies Record<string, { label: string; color: string }>;

export function CampaignEngagementByCityChart({
  data = [],
}: CampaignEngagementByCityChartProps) {
  if (data.length === 0) {
    return (
      <Card className="glass-card border-0 animate-slide-up">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <MapPin className="h-5 w-5" />
            Engagement by City
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-[200px] text-sm text-muted-foreground">
            No engagement data available
          </div>
        </CardContent>
      </Card>
    );
  }

  // Sort by engagement descending for better visualization
  const sortedData = [...data].sort((a, b) => b.engagement - a.engagement);

  return (
    <Card className="glass-card border-0 animate-slide-up">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <MapPin className="h-4 w-4" />
          Engagement by City
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="h-[200px] w-full">
          <BarChart
            accessibilityLayer
            data={sortedData}
            margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="city"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              tickFormatter={(value) => value.slice(0, 3)}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              tickFormatter={(value) => `${value}%`}
            />
            <ChartTooltip
              cursor={false}
              content={<ChartTooltipContent indicator="dot" />}
            />
            <Bar
              dataKey="engagement"
              fill="var(--color-engagement)"
              radius={[8, 8, 0, 0]}
            />
          </BarChart>
        </ChartContainer>
        <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
          {sortedData.slice(0, 3).map((item) => (
            <div key={item.city} className="flex items-center gap-1.5">
              <div 
                className="h-1.5 w-1.5 rounded-full" 
                style={{ backgroundColor: "hsl(210, 100%, 56%)" }}
              />
              <span>
                {item.city}: {item.engagement.toFixed(1)}%
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
