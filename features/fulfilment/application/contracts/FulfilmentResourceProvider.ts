import type { ApplicationResult } from "@/lib/result/ApplicationResult";

export type ResourceAllocationStatus =
  | "available"
  | "reserved"
  | "fulfilled"
  | "released";

export type AllocateResourceInput = {
  fulfilmentId: string;
  resourceId: string;
};

export type AllocationLifecycleInput = {
  fulfilmentId: string;
  resourceId: string;
  allocationId: string;
};

export type ResourceAllocationResult = {
  allocationId: string;
  fulfilmentId: string;
  resourceId: string;
  resourceItemId: string | null;
  status: ResourceAllocationStatus;
  /** Display/asset code when applicable (pool serial or generated). */
  code: string | null;
};

/**
 * Port implemented by resource infrastructure providers.
 * Resource lifecycle is independent of Fulfilment.state.
 */
export type FulfilmentResourceProvider = {
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
