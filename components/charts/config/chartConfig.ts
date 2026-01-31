import { ChartConfig } from "@/components/ui/chart";

export const chartConfig = {
  riders: {
    label: "Riders",
  },
  impressions: {
    label: "Impressions",
  },
  revenue: {
    label: "Revenue (€)",
  },
  january: {
    label: "January",
    color: "var(--chart-1)",
  },
  february: {
    label: "February",
    color: "var(--chart-2)",
  },
  march: {
    label: "March",
    color: "var(--chart-3)",
  },
  april: {
    label: "April",
    color: "var(--chart-4)",
  },
  may: {
    label: "May",
    color: "var(--chart-5)",
  },
} satisfies ChartConfig;
