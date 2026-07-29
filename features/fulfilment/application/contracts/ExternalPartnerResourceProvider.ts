import type { ApplicationResult } from "@/lib/result/ApplicationResult";
import type {
  AllocateResourceInput,
  AllocationLifecycleInput,
  ResourceAllocationResult,
} from "./FulfilmentResourceProvider";

/**
 * Phase 1: interface only — partner-hosted capacity / external allocation.
 * No infrastructure implementation in this plan.
 */
export type ExternalPartnerResourceProvider = {
  allocate: (
    input: AllocateResourceInput,
  ) => Promise<ApplicationResult<ResourceAllocationResult>>;
  release: (
    input: AllocationLifecycleInput,
  ) => Promise<ApplicationResult<ResourceAllocationResult>>;
  fulfil: (
    input: AllocationLifecycleInput,
  ) => Promise<ApplicationResult<ResourceAllocationResult>>;
};
