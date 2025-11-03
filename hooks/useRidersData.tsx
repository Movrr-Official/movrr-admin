"use client";

import { useQuery } from "@tanstack/react-query";
import { useSelector } from "react-redux";
import { RootState } from "@/redux/store";

import { Rider, RiderFiltersSchema } from "@/schemas";
import { mockRiders } from "@/data/mockRiders";
import { mockRoutes } from "@/data/mockRoutes";

export const useRidersData = (filters?: RiderFiltersSchema) => {
  const selectedRouteIds = useSelector(
    (state: RootState) => state.routeFilter.selectedRouteIds
  );

  return useQuery<Rider[]>({
    queryKey: ["riders", filters, selectedRouteIds],
    queryFn: async () => {
      await new Promise((resolve) => setTimeout(resolve, 500));

      let riders = [...mockRiders];
      const routes = [...mockRoutes]; // Use mock or query cache

      if (filters?.status && filters.status !== "all") {
        riders = riders.filter((rider) => rider.status === filters.status);
      }

      if (filters?.vehicleType && filters.vehicleType !== "all") {
        riders = riders.filter(
          (rider) => rider.vehicle?.type === filters.vehicleType
        );
      }

      if (filters?.minRating && filters.minRating !== "all") {
        const minRating = parseFloat(filters.minRating);
        riders = riders.filter((rider) => rider.rating >= minRating);
      }

      if (filters?.searchQuery) {
        const query = filters.searchQuery.toLowerCase();
        riders = riders.filter(
          (rider) =>
            rider.name.toLowerCase().includes(query) ||
            rider.email.toLowerCase().includes(query)
        );
      }

      // Filter by route selection
      if (selectedRouteIds.length > 0) {
        riders = riders.filter(
          (rider) =>
            !rider.currentRoute ||
            selectedRouteIds.includes(rider.currentRoute.id)
        );
      }

      // Enhance with route and performance stats
      riders = riders.map((rider) => {
        const assignedRoute = routes.find(
          (route) => route.id === rider.currentRoute?.id
        );
        const riderRoutes = routes.filter(
          (route) => route.id === rider.currentRoute?.id
        );
        const completedRoutes = riderRoutes.filter(
          (route) => route.status === "completed"
        );
        const inProgressRoutes = riderRoutes.filter(
          (route) => route.status === "assigned"
        );

        // Calculate performance metrics
        const totalDistance = completedRoutes.reduce(
          (sum, route) => sum + (route.completionTime || 0),
          0
        );
        const avgCompletionTime = completedRoutes.length
          ? completedRoutes.reduce(
              (sum, route) => sum + (route.completionTime || 0),
              0
            ) / completedRoutes.length
          : 0;

        return {
          ...rider,
          currentRoute: assignedRoute ? { ...assignedRoute } : undefined,
          performanceStats: {
            totalRoutes: riderRoutes.length,
            completedRoutes: completedRoutes.length,
            inProgressRoutes: inProgressRoutes.length,
            totalDistance,
            avgCompletionTime: parseFloat(avgCompletionTime.toFixed(2)),
            efficiency: completedRoutes.length
              ? parseFloat(
                  (
                    totalDistance /
                    (avgCompletionTime * completedRoutes.length)
                  ).toFixed(2)
                )
              : 0,
          },
        };
      });

      return riders;
    },
  });
};
