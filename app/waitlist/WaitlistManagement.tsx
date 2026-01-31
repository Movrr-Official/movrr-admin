"use client";

import { Users, TrendingUp, CheckCircle, Clock } from "lucide-react";
import { WaitlistTable } from "@/components/waitlist/WaitlistTable";
import { useWaitlistData } from "@/hooks/useWaitlistData";
import { StatsCard } from "@/components/stats/StatsCard";

export default function WaitlistManagement() {
  const {
    data: entries,
    refetch,
    isLoading,
    isFetching,
    error,
  } = useWaitlistData();

  const stats = [
    {
      label: "Total Entries",
      value: entries?.length,
      icon: Users,
      color: "bg-blue-100 text-blue-600 dark:bg-blue-950 dark:text-blue-400",
    },
    {
      label: "Approved",
      value: entries?.filter((e) => e.status === "approved").length,
      icon: CheckCircle,
      color:
        "bg-green-100 text-green-600 dark:bg-green-950 dark:text-green-400",
    },
    {
      label: "Pending",
      value: entries?.filter((e) => e.status === "pending").length,
      icon: Clock,
      color:
        "bg-amber-100 text-amber-600 dark:bg-amber-950 dark:text-amber-400",
    },
    {
      label: "Approval Rate",
      value: `${Math.round(((entries?.filter((e) => e.status === "approved")?.length ?? 0) / (entries?.length ?? 1)) * 100)}%`,
      icon: TrendingUp,
      color: "bg-primary/10 text-primary",
    },
  ];

  return (
    <div className="min-h-screen gradient-bg px-4 sm:px-6 py-8 md:py-12 lg:py-16 lg:pt-6">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-10 w-32 h-32 bg-primary/5 rounded-full blur-3xl animate-float"></div>
        <div
          className="absolute top-40 right-20 w-48 h-48 bg-primary/3 rounded-full blur-3xl animate-float"
          style={{ animationDelay: "2s" }}
        ></div>
        <div
          className="absolute bottom-20 left-1/3 w-40 h-40 bg-primary/4 rounded-full blur-3xl animate-float"
          style={{ animationDelay: "4s" }}
        ></div>
      </div>

      <div className="space-y-6 md:space-y-8">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
          <StatsCard
            title="Total Entries"
            value={stats[0].value ?? 0}
            icon={Users}
            animationDelay="0s"
          />
          <StatsCard
            title="Approved"
            value={stats[1].value ?? 0}
            icon={CheckCircle}
            animationDelay="0.1s"
          />
          <StatsCard
            title="Pending"
            value={stats[2].value ?? 0}
            icon={Clock}
            animationDelay="0.2s"
          />
          <StatsCard
            title="Approval Rate"
            value={stats[3].value ?? "0%"}
            icon={TrendingUp}
            animationDelay="0.3s"
          />
        </div>

        {/* Waitlist Table */}
        <WaitlistTable
          entries={entries ?? []}
          isLoading={isLoading}
          isRefetching={isFetching}
          toolbar={true}
          searchBar={false}
          refetchData={refetch}
        />
      </div>
    </div>
  );
}
