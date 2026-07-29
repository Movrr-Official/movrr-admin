"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  platformGet,
  platformPatch,
  platformPost,
} from "@/lib/platformApi/client";
import type { Organisation } from "@/features/organisations/domain/Organisation";
import type { OrganisationMembership } from "@/features/organisations/domain/Membership";
import type { MembershipRole } from "@/features/organisations/domain/CapabilityCatalog";

export type CreateOrganisationInput = {
  name: string;
  type: Organisation["type"];
};

export type AddStaffInput = {
  organisationId: string;
  userId: string;
  role: MembershipRole;
};

export type UpdateStaffRoleInput = {
  organisationId: string;
  membershipId: string;
  role: MembershipRole;
};

export type UpdateOrganisationInput = {
  id: string;
  name?: string;
  status?: Organisation["status"];
  partnerProfile?: {
    contactEmail?: string | null;
    website?: string | null;
    logoUrl?: string | null;
  };
};

export function useOrganisations(type?: Organisation["type"]) {
  return useQuery<Organisation[]>({
    queryKey: ["organisations", type ?? "all"],
    queryFn: async () => {
      const path = type
        ? `/api/v1/organisations?type=${encodeURIComponent(type)}`
        : "/api/v1/organisations";
      const result = await platformGet<Organisation[]>(path);
      if (!result.ok) {
        throw new Error(result.message || "Failed to load organisations");
      }
      return result.value;
    },
  });
}

export function useOrganisation(id: string) {
  return useQuery<Organisation>({
    queryKey: ["organisation", id],
    enabled: Boolean(id),
    queryFn: async () => {
      const result = await platformGet<Organisation>(
        `/api/v1/organisations/${encodeURIComponent(id)}`,
      );
      if (!result.ok) {
        throw new Error(result.message || "Failed to load organisation");
      }
      return result.value;
    },
  });
}

export function useOrganisationStaff(organisationId: string) {
  return useQuery<OrganisationMembership[]>({
    queryKey: ["organisation-staff", organisationId],
    enabled: Boolean(organisationId),
    queryFn: async () => {
      const result = await platformGet<OrganisationMembership[]>(
        `/api/v1/organisations/${encodeURIComponent(organisationId)}/staff`,
      );
      if (!result.ok) {
        throw new Error(result.message || "Failed to load staff");
      }
      return result.value;
    },
  });
}

export function useCreateOrganisation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateOrganisationInput) => {
      const result = await platformPost<Organisation>("/api/v1/organisations", {
        body: input,
      });
      if (!result.ok) {
        throw new Error(result.message || "Failed to create organisation");
      }
      return result.value;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["organisations"] });
    },
  });
}

export function useUpdateOrganisation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpdateOrganisationInput) => {
      const { id, ...body } = input;
      const result = await platformPatch<Organisation>(
        `/api/v1/organisations/${encodeURIComponent(id)}`,
        { body },
      );
      if (!result.ok) {
        throw new Error(result.message || "Failed to update organisation");
      }
      return result.value;
    },
    onSuccess: (organisation) => {
      void queryClient.invalidateQueries({ queryKey: ["organisations"] });
      void queryClient.invalidateQueries({
        queryKey: ["organisation", organisation.id],
      });
    },
  });
}

export function useAddOrganisationStaff() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: AddStaffInput) => {
      const result = await platformPost<OrganisationMembership>(
        `/api/v1/organisations/${encodeURIComponent(input.organisationId)}/staff`,
        {
          body: { userId: input.userId, role: input.role },
        },
      );
      if (!result.ok) {
        throw new Error(result.message || "Failed to add staff member");
      }
      return result.value;
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: ["organisation-staff", variables.organisationId],
      });
    },
  });
}

export function useUpdateOrganisationStaffRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpdateStaffRoleInput) => {
      const result = await platformPatch<OrganisationMembership>(
        `/api/v1/organisations/${encodeURIComponent(input.organisationId)}/staff`,
        {
          body: {
            membershipId: input.membershipId,
            role: input.role,
          },
        },
      );
      if (!result.ok) {
        throw new Error(result.message || "Failed to update staff role");
      }
      return result.value;
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: ["organisation-staff", variables.organisationId],
      });
    },
  });
}
