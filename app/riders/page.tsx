"use client";

import { motion } from "framer-motion";
import { useState } from "react";
import { Button } from "@/components/ui/button";

import { Plus } from "lucide-react";
import { staggerContainer, fadeInUp } from "@/lib/animations";
import { RiderTable } from "@/components/riders/RiderTable";
import RiderFilter from "@/components/riders/RiderFilter";
import { RiderFiltersSchema } from "@/schemas";
import { useRidersData } from "@/hooks/useRidersData";
import { useUsersData } from "@/hooks/useUsersData";

export default function RidersPage() {
  const [filters, setFilters] = useState<RiderFiltersSchema>({});
  const { data: riders, isLoading } = useRidersData(filters);

  const { data: users = [] } = useUsersData(filters);

  // Suppose you have arrays: users: User[] and riders: Rider[]
  const ridersWithUserInfo = riders?.map((rider) => {
    const user = users.find((u) => u.id === rider.userId);
    return {
      ...rider,
      name: user?.name ?? rider.name,
      email: user?.email ?? rider.email,
      avatarUrl: user?.avatarUrl ?? rider.avatarUrl,
      languagePreference: user?.languagePreference ?? rider.languagePreference,
    };
  });

  return (
    <motion.div
      variants={staggerContainer}
      initial="initial"
      animate="animate"
      className="min-h-screen gradient-bg px-4 sm:px-6 py-8 md:py-12 lg:py-16 space-y-6"
    >
      {/* Header */}
      <motion.div
        variants={fadeInUp}
        className="flex items-center justify-between"
      >
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Riders</h1>
          <p className="text-gray-600">Manage your rider network</p>
        </div>
        <Button>
          <Plus className="w-4 h-4 mr-2" />
          Add Rider
        </Button>
      </motion.div>

      {/* Filters */}
      <motion.div variants={fadeInUp}>
        <RiderFilter onFilterChange={setFilters} isLoading={isLoading} />
      </motion.div>

      {/* Content */}
      <motion.div variants={fadeInUp}>
        <RiderTable riders={ridersWithUserInfo || []} isLoading={isLoading} />
      </motion.div>
    </motion.div>
  );
}
