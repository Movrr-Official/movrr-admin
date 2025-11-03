"use client";

import { useState, useEffect } from "react";
import { mockRoutes } from "@/data/mockRoutes";

type RouteData = typeof mockRoutes;

export function useRouteData() {
  const [data, setData] = useState<RouteData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      await new Promise((resolve) => setTimeout(resolve, 1200));
      setData(mockRoutes);
      setIsLoading(false);
    };

    fetchData();
  }, []);

  return { data, isLoading };
}
