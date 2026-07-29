import type { ApplicationResult } from "@/lib/result/ApplicationResult";
import type { Fulfilment } from "@/features/fulfilment/domain/Fulfilment";
import type { FulfilmentState } from "@/features/fulfilment/domain/states";
import type { TokenRecord, TokenType } from "@/features/fulfilment/application/commands/tokenService";

/**
 * Handlers request SM transitions only — never assign fulfilment.state.
 * Cross-feature orchestration (wallet) stays in FulfilmentEngine.
 */
export type RequestTransition = (
  fulfilment: Fulfilment,
  to: FulfilmentState,
  reason: string,
) => ApplicationResult<Fulfilment>;

export type FulfilmentHandlerResult = {
  fulfilment: Fulfilment;
  /** Plaintext returned once at QR start; never persisted by engine. */
  issuedTokenPlaintext?: string;
};

export type FulfilmentHandlerStartContext = {
  fulfilment: Fulfilment;
  resourceId: string;
  correlationId: string;
  tokenType?: TokenType;
  requestTransition: RequestTransition;
};

export type FulfilmentHandlerTokenContext = {
  fulfilment: Fulfilment;
  correlationId: string;
  token: TokenRecord;
  requestTransition: RequestTransition;
};

export type FulfilmentHandlerCollectionContext = {
  fulfilment: Fulfilment;
  resourceId: string;
  correlationId: string;
  requestTransition: RequestTransition;
};

export type FulfilmentHandlerCancelContext = {
  fulfilment: Fulfilment;
  reason: string;
  resourceId: string | null;
  correlationId: string;
  requestTransition: RequestTransition;
};

export type FulfilmentHandlerExpireContext = FulfilmentHandlerCancelContext;

export type FulfilmentHandler = {
  start: (
    ctx: FulfilmentHandlerStartContext,
  ) => Promise<ApplicationResult<FulfilmentHandlerResult>>;
  onTokenConsumed?: (
    ctx: FulfilmentHandlerTokenContext,
  ) => Promise<ApplicationResult<FulfilmentHandlerResult>>;
  confirmCollection?: (
    ctx: FulfilmentHandlerCollectionContext,
  ) => Promise<ApplicationResult<FulfilmentHandlerResult>>;
  cancel?: (
    ctx: FulfilmentHandlerCancelContext,
  ) => Promise<ApplicationResult<FulfilmentHandlerResult>>;
  expire?: (
    ctx: FulfilmentHandlerExpireContext,
  ) => Promise<ApplicationResult<FulfilmentHandlerResult>>;
};
