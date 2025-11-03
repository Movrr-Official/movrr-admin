"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, TrendingUp, CheckCircle, Clock } from "lucide-react";
import { WaitlistTable } from "@/components/waitlist/WaitlistTable";
import { PageHeader } from "@/components/PageHeader";
import { useWaitlistData } from "@/hooks/useWaitlistData";

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
    <div className="min-h-screen gradient-bg px-4 sm:px-6 py-8 md:py-12 lg:py-16">
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
        {/* Header */}
        <PageHeader
          title="Waitlist Management"
          description="Manage and track all waitlist entries from potential riders"
        />

        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
          {stats.map((stat, index) => {
            const Icon = stat.icon;
            return (
              <Card
                key={index}
                className="glass-card border-0 shadow-lg hover:shadow-xl transition-all duration-300 group overflow-hidden relative animate-slide-up"
                style={{ animationDelay: `${index * 0.1}s` }}
              >
                <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3 relative z-10">
                  <CardTitle className="text-sm font-semibold text-muted-foreground">
                    {stat.label}
                  </CardTitle>
                  <div
                    className={`p-3 rounded-xl group-hover:scale-110 transition-all duration-300 ${stat.color}`}
                  >
                    <Icon className="h-5 w-5" />
                  </div>
                </CardHeader>
                <CardContent className="relative z-10">
                  <div className="text-3xl md:text-4xl font-bold text-foreground">
                    {stat.value}
                  </div>
                </CardContent>
              </Card>
            );
          })}
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
