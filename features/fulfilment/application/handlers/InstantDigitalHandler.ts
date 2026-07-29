import { ok, type ApplicationResult } from "@/lib/result/ApplicationResult";
import type { ResourceAllocationService } from "@/features/fulfilment/application/contracts/ResourceAllocationService";
import type {
  FulfilmentHandler,
  FulfilmentHandlerCancelContext,
  FulfilmentHandlerResult,
  FulfilmentHandlerStartContext,
} from "@/features/fulfilment/application/contracts/FulfilmentHandler";

export type InstantDigitalHandlerDeps = {
  resources: ResourceAllocationService;
};

type AllocationRef = {
  resourceId: string;
  allocationId: string;
};

/**
 * Instant digital: created → processing → ready → completed.
 * Requests SM transitions only; allocates via ResourceAllocationService.
 */
export function createInstantDigitalHandler(
  deps: InstantDigitalHandlerDeps,
): FulfilmentHandler {
  const allocations = new Map<string, AllocationRef>();

  return {
    async start(
      ctx: FulfilmentHandlerStartContext,
    ): Promise<ApplicationResult<FulfilmentHandlerResult>> {
      const allocated = await deps.resources.allocate({
        fulfilmentId: ctx.fulfilment.id,
        resourceId: ctx.resourceId,
      });

      if (!allocated.ok) {
        const failed = await ctx.requestTransition(
          ctx.fulfilment,
          "failed",
          "resource_allocate_failed",
        );
        if (!failed.ok) return failed;
        return ok({ fulfilment: failed.value });
      }

      allocations.set(ctx.fulfilment.id, {
        resourceId: ctx.resourceId,
        allocationId: allocated.value.allocationId,
      });

      const processing = await ctx.requestTransition(
        ctx.fulfilment,
        "processing",
        "resource_allocated",
      );
      if (!processing.ok) return processing;

      const fulfilled = await deps.resources.fulfil({
        fulfilmentId: ctx.fulfilment.id,
        resourceId: ctx.resourceId,
        allocationId: allocated.value.allocationId,
      });
      if (!fulfilled.ok) {
        const failed = await ctx.requestTransition(
          processing.value,
          "failed",
          "resource_fulfil_failed",
        );
        if (!failed.ok) return failed;
        return ok({ fulfilment: failed.value });
      }

      const ready = await ctx.requestTransition(
        processing.value,
        "ready",
        "digital_asset_delivered",
      );
      if (!ready.ok) return ready;

      const completed = await ctx.requestTransition(
        ready.value,
        "completed",
        "instant_digital_complete",
      );
      if (!completed.ok) return completed;

      return ok({ fulfilment: completed.value });
    },

    async cancel(
      ctx: FulfilmentHandlerCancelContext,
    ): Promise<ApplicationResult<FulfilmentHandlerResult>> {
      const ref = allocations.get(ctx.fulfilment.id);
      if (ref) {
        await deps.resources.release({
          fulfilmentId: ctx.fulfilment.id,
          resourceId: ref.resourceId,
          allocationId: ref.allocationId,
        });
        allocations.delete(ctx.fulfilment.id);
      }

      const cancelled = await ctx.requestTransition(
        ctx.fulfilment,
        "cancelled",
        ctx.reason,
      );
      if (!cancelled.ok) return cancelled;
      return ok({ fulfilment: cancelled.value });
    },

    async expire(
      ctx: FulfilmentHandlerCancelContext,
    ): Promise<ApplicationResult<FulfilmentHandlerResult>> {
      const ref = allocations.get(ctx.fulfilment.id);
      if (ref) {
        await deps.resources.release({
          fulfilmentId: ctx.fulfilment.id,
          resourceId: ref.resourceId,
          allocationId: ref.allocationId,
        });
        allocations.delete(ctx.fulfilment.id);
      }

      const expired = await ctx.requestTransition(
        ctx.fulfilment,
        "expired",
        ctx.reason,
      );
      if (!expired.ok) return expired;
      return ok({ fulfilment: expired.value });
    },
  };
}
