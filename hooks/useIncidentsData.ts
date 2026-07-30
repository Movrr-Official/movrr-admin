"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createIncident,
  getIncidents,
  getOpenIncidentCount,
  setIncidentStatus,
} from "@/app/actions/incidents";
import type {
  CreateIncidentInput,
  IncidentStatus,
} from "@/features/incidents/types";

export const INCIDENTS_QUERY_KEY = ["incidents"] as const;
export const OPEN_INCIDENTS_COUNT_QUERY_KEY = ["openIncidentsCount"] as const;

export function useIncidentsData() {
  return useQuery({
    queryKey: INCIDENTS_QUERY_KEY,
    queryFn: async () => {
      const result = await getIncidents();
      if (!result.success || !result.data) {
        throw new Error(result.error || "Failed to load incidents");
      }
      return result.data;
    },
    staleTime: 1000 * 60,
  });
}

export function useOpenIncidentCount(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: OPEN_INCIDENTS_COUNT_QUERY_KEY,
    queryFn: () => getOpenIncidentCount(),
    staleTime: 1000 * 60,
    enabled: options?.enabled ?? true,
  });
}

export function useCreateIncident() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateIncidentInput) => {
      const result = await createIncident(input);
      if (!result.success || !result.data) {
        throw new Error(result.error || "Failed to create incident");
      }
      return result.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: INCIDENTS_QUERY_KEY });
      void queryClient.invalidateQueries({
        queryKey: OPEN_INCIDENTS_COUNT_QUERY_KEY,
      });
    },
  });
}

export function useUpdateIncidentStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; status: IncidentStatus }) => {
      const result = await setIncidentStatus(input);
      if (!result.success || !result.data) {
        throw new Error(result.error || "Failed to update incident");
      }
      return result.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: INCIDENTS_QUERY_KEY });
      void queryClient.invalidateQueries({
        queryKey: OPEN_INCIDENTS_COUNT_QUERY_KEY,
      });
    },
  });
}
