import { randomBytes, randomUUID } from "crypto";
import { fail, ok, type ApplicationResult } from "@/lib/result/ApplicationResult";
import type {
  AllocateResourceInput,
  AllocationLifecycleInput,
  FulfilmentResourceProvider,
  ResourceAllocationResult,
} from "@/features/fulfilment/application/contracts/FulfilmentResourceProvider";

export type GeneratedDigitalResourceProvider = FulfilmentResourceProvider;

function generateUniqueCode(): string {
  return `MOVRR-${randomBytes(8).toString("hex").toUpperCase()}`;
}

/**
 * MOVRR-issued dynamic digital assets — unique code per allocation.
 */
export function createGeneratedDigitalResourceProvider(): GeneratedDigitalResourceProvider {
  const allocations = new Map<string, ResourceAllocationResult>();
  const issuedCodes = new Set<string>();

  return {
    async allocate(
      input: AllocateResourceInput,
    ): Promise<ApplicationResult<ResourceAllocationResult>> {
      let code = generateUniqueCode();
      while (issuedCodes.has(code)) {
        code = generateUniqueCode();
      }
      issuedCodes.add(code);

      const result: ResourceAllocationResult = {
        allocationId: randomUUID(),
        fulfilmentId: input.fulfilmentId,
        resourceId: input.resourceId,
        resourceItemId: randomUUID(),
        status: "reserved",
        code,
      };
      allocations.set(result.allocationId, result);
      return ok(result);
    },

    async release(
      input: AllocationLifecycleInput,
    ): Promise<ApplicationResult<ResourceAllocationResult>> {
      const allocation = allocations.get(input.allocationId);
      if (!allocation || allocation.resourceId !== input.resourceId) {
        return fail("BusinessFailure", "Allocation not found");
      }
      if (allocation.status !== "reserved") {
        return fail(
          "BusinessFailure",
          `Cannot release allocation in status ${allocation.status}`,
        );
      }
      const updated: ResourceAllocationResult = {
        ...allocation,
        status: "released",
      };
      allocations.set(input.allocationId, updated);
      return ok(updated);
    },

    async fulfil(
      input: AllocationLifecycleInput,
    ): Promise<ApplicationResult<ResourceAllocationResult>> {
      const allocation = allocations.get(input.allocationId);
      if (!allocation || allocation.resourceId !== input.resourceId) {
        return fail("BusinessFailure", "Allocation not found");
      }
      if (allocation.status !== "reserved") {
        return fail(
          "BusinessFailure",
          `Cannot fulfil allocation in status ${allocation.status}`,
        );
      }
      const updated: ResourceAllocationResult = {
        ...allocation,
        status: "fulfilled",
      };
      allocations.set(input.allocationId, updated);
      return ok(updated);
    },
  };
}
