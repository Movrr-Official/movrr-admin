import { randomUUID } from "crypto";
import { fail, ok, type ApplicationResult } from "@/lib/result/ApplicationResult";
import type {
  AllocateResourceInput,
  AllocationLifecycleInput,
  FulfilmentResourceProvider,
  ResourceAllocationResult,
  ResourceAllocationStatus,
} from "@/features/fulfilment/application/contracts/FulfilmentResourceProvider";

type PoolItem = {
  id: string;
  code: string;
  status: ResourceAllocationStatus;
};

type AllocationRecord = ResourceAllocationResult;

export type VoucherPoolResourceProvider = FulfilmentResourceProvider & {
  seedPool: (
    resourceId: string,
    items: Array<{ id: string; code: string }>,
  ) => Promise<void>;
};

/**
 * Partner-supplied voucher codes. Allocates available pool items once.
 */
export function createVoucherPoolResourceProvider(): VoucherPoolResourceProvider {
  const pools = new Map<string, PoolItem[]>();
  const allocations = new Map<string, AllocationRecord>();
  const resourceQueues = new Map<string, Promise<void>>();

  async function withResourceLock<T>(
    resourceId: string,
    fn: () => Promise<T>,
  ): Promise<T> {
    const previous = resourceQueues.get(resourceId) ?? Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    resourceQueues.set(
      resourceId,
      previous.then(() => gate).catch(() => gate),
    );
    await previous.catch(() => undefined);
    try {
      return await fn();
    } finally {
      release();
    }
  }

  return {
    async seedPool(resourceId, items) {
      pools.set(
        resourceId,
        items.map((item) => ({
          id: item.id,
          code: item.code,
          status: "available" as const,
        })),
      );
    },

    async allocate(
      input: AllocateResourceInput,
    ): Promise<ApplicationResult<ResourceAllocationResult>> {
      return withResourceLock(input.resourceId, async () => {
        const pool = pools.get(input.resourceId);
        if (!pool) {
          return fail("BusinessFailure", "Resource pool not found");
        }

        const item = pool.find((entry) => entry.status === "available");
        if (!item) {
          return fail("BusinessFailure", "No available items in voucher pool");
        }

        item.status = "reserved";
        const result: ResourceAllocationResult = {
          allocationId: randomUUID(),
          fulfilmentId: input.fulfilmentId,
          resourceId: input.resourceId,
          resourceItemId: item.id,
          status: "reserved",
          code: item.code,
        };
        allocations.set(result.allocationId, result);
        return ok(result);
      });
    },

    async release(
      input: AllocationLifecycleInput,
    ): Promise<ApplicationResult<ResourceAllocationResult>> {
      return withResourceLock(input.resourceId, async () => {
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

        const pool = pools.get(input.resourceId) ?? [];
        const item = pool.find((entry) => entry.id === allocation.resourceItemId);
        if (item) {
          item.status = "available";
        }

        const updated: ResourceAllocationResult = {
          ...allocation,
          status: "released",
        };
        allocations.set(input.allocationId, updated);
        return ok(updated);
      });
    },

    async fulfil(
      input: AllocationLifecycleInput,
    ): Promise<ApplicationResult<ResourceAllocationResult>> {
      return withResourceLock(input.resourceId, async () => {
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

        const pool = pools.get(input.resourceId) ?? [];
        const item = pool.find((entry) => entry.id === allocation.resourceItemId);
        if (item) {
          item.status = "fulfilled";
        }

        const updated: ResourceAllocationResult = {
          ...allocation,
          status: "fulfilled",
        };
        allocations.set(input.allocationId, updated);
        return ok(updated);
      });
    },
  };
}
