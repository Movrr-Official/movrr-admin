"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Area,
  AreaChart as RechartsAreaChart,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartTooltipContent } from "@/components/charts/ChartTooltipContent";
import type { RiderRoute } from "@/schemas";

const STATUS_COLORS: Record<string, string> = {
  assigned: "#3b82f6",
  "in-progress": "#f59e0b",
  completed: "#10b981",
  cancelled: "#ef4444",
};

const PERFORMANCE_COLORS: Record<string, string> = {
  high: "#10b981",
  medium: "#f59e0b",
  low: "#ef4444",
};

const formatDateKey = (date: Date) =>
  `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;

export function RouteAnalytics({ routes }: { routes: RiderRoute[] }) {
  const routesByCity = routes.reduce(
    (acc, route) => {
      acc[route.city] = (acc[route.city] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  const topCities = Object.entries(routesByCity)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([name, value]) => ({ name, value }));

  const statusCounts = [
    "assigned",
    "in-progress",
    "completed",
    "cancelled",
  ].map((status) => ({
    name: status,
    value: routes.filter((route) => route.status === status).length,
  }));

  const performanceCounts = ["high", "medium", "low"].map((performance) => ({
    name: performance,
    value: routes.filter((route) => route.performance === performance).length,
  }));

  const today = new Date();
  const recentDays = Array.from({ length: 7 }, (_, idx) => {
    const date = new Date();
    date.setDate(today.getDate() - (6 - idx));
    return date;
  });

  const routesByDay = routes.reduce(
    (acc, route) => {
      const date = new Date(route.assignedDate);
      const key = formatDateKey(date);
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  const recentRoutes = recentDays.map((date) => {
    const key = formatDateKey(date);
    return {
      name: date.toLocaleDateString(undefined, { weekday: "short" }),
      value: routesByDay[key] ?? 0,
    };
  });

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 md:gap-6">
      <Card
        className="glass-card border-0 animate-slide-up"
        style={{ animationDelay: "0.4s" }}
      >
        <CardHeader className="pb-4">
          <CardTitle className="text-lg font-bold">Top Cities</CardTitle>
        </CardHeader>
        <CardContent className="h-64">
          {topCities.length ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topCities} margin={{ left: 0, right: 0 }}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="name" tickLine={false} axisLine={false} />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  allowDecimals={false}
                />
                <Tooltip content={<ChartTooltipContent />} />
                <Bar dataKey="value" radius={[6, 6, 0, 0]} fill="#3b82f6" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-muted-foreground">No city data yet.</p>
          )}
        </CardContent>
      </Card>

      <Card
        className="glass-card border-0 animate-slide-up"
        style={{ animationDelay: "0.5s" }}
      >
        <CardHeader className="pb-4">
          <CardTitle className="text-lg font-bold">
            Status Distribution
          </CardTitle>
        </CardHeader>
        <CardContent className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Tooltip content={<ChartTooltipContent />} />
              <Legend verticalAlign="bottom" height={24} iconType="circle" />
              <Pie
                data={statusCounts}
                dataKey="value"
                nameKey="name"
                innerRadius={50}
                outerRadius={80}
                strokeWidth={4}
              >
                {statusCounts.map((entry) => (
                  <Cell
                    key={entry.name}
                    fill={STATUS_COLORS[entry.name] ?? "#3b82f6"}
                  />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card
        className="glass-card border-0 animate-slide-up"
        style={{ animationDelay: "0.6s" }}
      >
        <CardHeader className="pb-4">
          <CardTitle className="text-lg font-bold">Performance Mix</CardTitle>
        </CardHeader>
        <CardContent className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={performanceCounts} margin={{ left: 0, right: 0 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="name" tickLine={false} axisLine={false} />
              <YAxis tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip content={<ChartTooltipContent />} />
              <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                {performanceCounts.map((entry) => (
                  <Cell
                    key={entry.name}
                    fill={PERFORMANCE_COLORS[entry.name] ?? "#3b82f6"}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card
        className="glass-card border-0 animate-slide-up"
        style={{ animationDelay: "0.7s" }}
      >
        <CardHeader className="pb-4">
          <CardTitle className="text-lg font-bold">
            Routes Created (7d)
          </CardTitle>
        </CardHeader>
        <CardContent className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <RechartsAreaChart
              data={recentRoutes}
              margin={{ left: 0, right: 0 }}
            >
              <defs>
                <linearGradient id="routeTrend" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.8} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0.1} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="name" tickLine={false} axisLine={false} />
              <YAxis tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip content={<ChartTooltipContent />} />
              <Area
                type="monotone"
                dataKey="value"
                stroke="#6366f1"
                fill="url(#routeTrend)"
                strokeWidth={2}
              />
            </RechartsAreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}
