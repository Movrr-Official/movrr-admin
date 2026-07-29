import { fail, type ApplicationResult } from "@/lib/result/ApplicationResult";
import type {
  FulfilmentHandler,
  FulfilmentHandlerResult,
  FulfilmentHandlerStartContext,
} from "@/features/fulfilment/application/contracts/FulfilmentHandler";

/**
 * Safety net for registered-but-unimplemented fulfilment types.
 * Catalog validation should block these under normal redeem; this catches misconfiguration.
 */
export function createUnsupportedFulfilmentHandler(): FulfilmentHandler {
  return {
    async start(
      _ctx: FulfilmentHandlerStartContext,
    ): Promise<ApplicationResult<FulfilmentHandlerResult>> {
      return fail(
        "fulfilment_type_not_implemented",
        "Fulfilment type is registered but not implemented in this phase",
      );
    },
  };
}
