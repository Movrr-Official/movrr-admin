"use client";

import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";

import { Badge } from "@/components/ui/badge";
import useShouldHideComponent from "@/hooks/useShouldHideComponent";
import { useSettingsData } from "@/hooks/useSettingsData";

const DashboardFooter = () => {
  const shouldHideFooter = useShouldHideComponent();
  const { data: settingsData } = useSettingsData({
    enabled: !shouldHideFooter,
  });
  const { data, isLoading, isError } = useQuery({
    queryKey: ["systemHealth"],
    queryFn: async () => {
      const response = await fetch("/api/health", { cache: "no-store" });
      if (!response.ok) {
        throw new Error("Failed to fetch health status");
      }
      return response.json() as Promise<{
        status: "operational" | "degraded" | "down";
        timestamp: string;
      }>;
    },
    staleTime: 1000 * 30,
    refetchInterval: 1000 * 60,
    retry: 1,
    enabled: !shouldHideFooter,
  });

  if (shouldHideFooter) {
    return null;
  }

  const currentYear = new Date().getFullYear();

  const pingEase = [0.15, 0.85, 0.35, 1.0] as const;
  const dotColor = isError
    ? "bg-destructive"
    : isLoading
      ? "bg-warning"
      : data?.status === "operational"
        ? "bg-success"
        : "bg-warning";
  const isOperational =
    !isError && !isLoading && data?.status === "operational";

  return (
    <footer className="flex h-16 shrink-0 items-center border-t border-border bg-background px-6">
      <div className="flex w-full flex-col items-center justify-between gap-2 text-xs text-muted-foreground sm:flex-row">
        <span>&copy; {currentYear} MOVRR</span>

        <div className="flex items-center gap-3">
          <Badge variant="outline" className="text-xs font-mono">
            v{settingsData?.values?.general?.appVersion ?? "0.1.0"}
          </Badge>
          <div className="flex items-center gap-2">
            <div className="relative flex h-2 w-2 shrink-0 items-center justify-center">
              {isOperational && (
                <>
                  <motion.span
                    className={`absolute inset-0 rounded-full ${dotColor}`}
                    animate={{ scale: [1, 2.75], opacity: [0.6, 0] }}
                    transition={{
                      duration: 1.05,
                      repeat: Infinity,
                      repeatDelay: 1.45,
                      ease: pingEase,
                    }}
                  />
                  <motion.span
                    className={`absolute inset-0 rounded-full ${dotColor}`}
                    animate={{ scale: [1, 2.1], opacity: [0.35, 0] }}
                    transition={{
                      duration: 0.85,
                      repeat: Infinity,
                      repeatDelay: 1.65,
                      delay: 0.35,
                      ease: pingEase,
                    }}
                  />
                </>
              )}
              <span
                className={`relative block h-2 w-2 rounded-full ${dotColor}`}
              />
            </div>
            <span>
              {isError
                ? "Status unavailable"
                : isLoading
                  ? "Checking status"
                  : data?.status === "operational"
                    ? "All systems operational"
                    : "Degraded service"}
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default DashboardFooter;
