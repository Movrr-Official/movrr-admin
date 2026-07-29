import type { ApplicationResult } from "@/lib/result/ApplicationResult";
import type {
  AllocateResourceInput,
  AllocationLifecycleInput,
  ResourceAllocationResult,
} from "./FulfilmentResourceProvider";

/**
 * Application contract used by fulfilment handlers/engine.
 * Providers are infrastructure behind this port.
 */
export type ResourceAllocationService = {
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
