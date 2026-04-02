import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { shouldUseMockData } from "@/lib/dataSource";
import { mockProTips } from "@/data/mockProTips";
import {
  getProTips,
  createProTip,
  updateProTip,
  deleteProTip,
  toggleProTipActive,
} from "@/app/actions/proTips";
import {
  ProTip,
  ProTipFiltersSchema,
  CreateProTipFormData,
  UpdateProTipFormData,
} from "@/schemas";

export const PRO_TIPS_QUERY_KEY = ["proTips"] as const;

export const useProTipsData = (filters?: ProTipFiltersSchema) => {
  return useQuery<ProTip[]>({
    queryKey: [...PRO_TIPS_QUERY_KEY, filters],
    queryFn: async () => {
      if (shouldUseMockData()) {
        await new Promise((r) => setTimeout(r, 300));
        return [...mockProTips];
      }
      const result = await getProTips(filters);
      if (!result.success || !result.data) {
        throw new Error(result.error ?? "Failed to fetch pro tips");
      }
      return result.data;
    },
    staleTime: 1000 * 60 * 10,
    gcTime: 1000 * 60 * 5,
  });
};

export const useCreateProTip = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateProTipFormData) => createProTip(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PRO_TIPS_QUERY_KEY });
    },
  });
};

export const useUpdateProTip = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateProTipFormData) => updateProTip(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PRO_TIPS_QUERY_KEY });
    },
  });
};

export const useDeleteProTip = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteProTip(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PRO_TIPS_QUERY_KEY });
    },
  });
};

export const useToggleProTipActive = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      toggleProTipActive(id, isActive),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PRO_TIPS_QUERY_KEY });
    },
  });
};
