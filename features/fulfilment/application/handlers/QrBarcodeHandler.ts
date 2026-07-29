import { fail, ok, type ApplicationResult } from "@/lib/result/ApplicationResult";
import type { ResourceAllocationService } from "@/features/fulfilment/application/contracts/ResourceAllocationService";
import type {
  TokenService,
  TokenType,
} from "@/features/fulfilment/application/commands/tokenService";
import type {
  FulfilmentHandler,
  FulfilmentHandlerCancelContext,
  FulfilmentHandlerCollectionContext,
  FulfilmentHandlerResult,
  FulfilmentHandlerStartContext,
  FulfilmentHandlerTokenContext,
} from "@/features/fulfilment/application/contracts/FulfilmentHandler";

export type QrBarcodeHandlerDeps = {
  resources: ResourceAllocationService;
  tokens: TokenService;
};

type AllocationRef = {
  resourceId: string;
  allocationId: string;
};

/**
 * QR/barcode: created → reserved → ready → awaiting_collection → validated → collected → completed.
 * Requests SM transitions only; resource + token ops are type-specific ports.
 */
export function createQrBarcodeHandler(
  deps: QrBarcodeHandlerDeps,
): FulfilmentHandler {
  const allocations = new Map<string, AllocationRef>();

  return {
    async start(
      ctx: FulfilmentHandlerStartContext,
    ): Promise<ApplicationResult<FulfilmentHandlerResult>> {
      const tokenType: TokenType = ctx.tokenType ?? "qr";

      const allocated = await deps.resources.allocate({
        fulfilmentId: ctx.fulfilment.id,
        resourceId: ctx.resourceId,
      });

      if (!allocated.ok) {
        const failed = ctx.requestTransition(
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

      const reserved = ctx.requestTransition(
        ctx.fulfilment,
        "reserved",
        "resource_reserved",
      );
      if (!reserved.ok) return reserved;

      const issued = await deps.tokens.issue({
        fulfilmentId: ctx.fulfilment.id,
        tokenType,
        correlationId: ctx.correlationId,
        expiresAt: ctx.fulfilment.expiresAt,
      });
      if (!issued.ok) {
        await deps.resources.release({
          fulfilmentId: ctx.fulfilment.id,
          resourceId: ctx.resourceId,
          allocationId: allocated.value.allocationId,
        });
        allocations.delete(ctx.fulfilment.id);
        const failed = ctx.requestTransition(
          reserved.value,
          "failed",
          "token_issue_failed",
        );
        if (!failed.ok) return failed;
        return ok({ fulfilment: failed.value });
      }

      const ready = ctx.requestTransition(
        reserved.value,
        "ready",
        "token_issued",
      );
      if (!ready.ok) return ready;

      const awaiting = ctx.requestTransition(
        ready.value,
        "awaiting_collection",
        "awaiting_partner_validation",
      );
      if (!awaiting.ok) return awaiting;

      return ok({
        fulfilment: awaiting.value,
        issuedTokenPlaintext: issued.value.plaintext,
      });
    },

    async onTokenConsumed(
      ctx: FulfilmentHandlerTokenContext,
    ): Promise<ApplicationResult<FulfilmentHandlerResult>> {
      if (ctx.token.fulfilmentId !== ctx.fulfilment.id) {
        return fail(
          "validation",
          "Token fulfilmentId does not match fulfilment",
        );
      }
      if (ctx.fulfilment.state !== "awaiting_collection") {
        return fail(
          "BusinessFailure",
          `Cannot validate from state ${ctx.fulfilment.state}`,
        );
      }

      const validated = ctx.requestTransition(
        ctx.fulfilment,
        "validated",
        "token_consumed",
      );
      if (!validated.ok) return validated;
      return ok({ fulfilment: validated.value });
    },

    async confirmCollection(
      ctx: FulfilmentHandlerCollectionContext,
    ): Promise<ApplicationResult<FulfilmentHandlerResult>> {
      if (ctx.fulfilment.state !== "validated") {
        return fail(
          "BusinessFailure",
          `Cannot confirm collection from state ${ctx.fulfilment.state}`,
        );
      }

      const collected = ctx.requestTransition(
        ctx.fulfilment,
        "collected",
        "collection_confirmed",
      );
      if (!collected.ok) return collected;

      const ref = allocations.get(ctx.fulfilment.id);
      if (ref) {
        const fulfilled = await deps.resources.fulfil({
          fulfilmentId: ctx.fulfilment.id,
          resourceId: ref.resourceId,
          allocationId: ref.allocationId,
        });
        if (!fulfilled.ok) {
          const failed = ctx.requestTransition(
            collected.value,
            "failed",
            "resource_fulfil_failed",
          );
          if (!failed.ok) return failed;
          return ok({ fulfilment: failed.value });
        }
        allocations.delete(ctx.fulfilment.id);
      }

      const completed = ctx.requestTransition(
        collected.value,
        "completed",
        "qr_barcode_complete",
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

      const cancelled = ctx.requestTransition(
        ctx.fulfilment,
        "cancelled",
        ctx.reason,
      );
      if (!cancelled.ok) return cancelled;
      return ok({ fulfilment: cancelled.value });
    },
  };
}
