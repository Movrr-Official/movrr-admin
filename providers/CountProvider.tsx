"use client";

import { ReactNode, createContext, useContext } from "react";
import { useQuery } from "@tanstack/react-query";

import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/useToast";
import { getDashboardCounts } from "@/app/actions/count";

type CountContextType = {
  totalWaitlist: number;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => void;
  isRefetching: boolean;
};

const CountContext = createContext<CountContextType | undefined>(undefined);

export const CountProvider = ({ children }: { children: ReactNode }) => {
  const { toast } = useToast();

  const { data, isLoading, isError, error, refetch, isRefetching } = useQuery({
    queryKey: ["dashboardCounts"],
    queryFn: async () => {
      try {
        const counts = await getDashboardCounts();
        return counts;
      } catch (err) {
        toast({
          title: "Error fetching counts",
          description: "Failed to load dashboard data",
          variant: "destructive",
        });
        throw err;
      }
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
    retry: 2,
  });

  const value = {
    totalWaitlist: data?.totalWaitlist || 0,
    isLoading,
    isError,
    error,
    refetch,
    isRefetching,
  };

  return (
    <CountContext.Provider value={value}>{children}</CountContext.Provider>
  );
};

export const useCounts = () => {
  const context = useContext(CountContext);
  if (context === undefined) {
    throw new Error("useCounts must be used within a CountProvider");
  }
  return context;
};

export const CountSkeleton = ({ className }: { className?: string }) => (
  <Skeleton className={cn("h-4 w-4 rounded-full", className)} />
);

export const CountDisplay = ({
  count,
  isLoading,
  isError,
  className,
}: {
  count: number;
  isLoading: boolean;
  isError: boolean;
  className?: string;
}) => {
  if (isLoading) return <CountSkeleton className={className} />;
  if (isError)
    return (
      <span
        className={cn(
          "flex items-center justify-center h-4 w-4 rounded-full",
          "bg-destructive text-white text-xs",
          className
        )}
      >
        !
      </span>
    );
  return (
    <span className={cn("flex items-center justify-center px-0.5", className)}>
      {count}
    </span>
  );
};
