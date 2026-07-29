import type { Fulfilment } from "@/features/fulfilment/domain/Fulfilment";
import type { TokenType } from "@/features/fulfilment/application/commands/tokenService";

/** Engine-owned aggregate fields beyond the Fulfilment entity. */
export type StoredFulfilmentAggregate = {
  fulfilment: Fulfilment;
  resourceId: string;
  pointsCost: number;
  correlationId: string;
  tokenType: TokenType;
};

/**
 * Persistence port for FulfilmentEngine.
 * In-memory for tests; Supabase-backed in production (Phase 4.5).
 */
export type FulfilmentAggregateStore = {
  get(id: string): Promise<StoredFulfilmentAggregate | null>;
  exists(id: string): Promise<boolean>;
  save(aggregate: StoredFulfilmentAggregate): Promise<void>;
  list(): Promise<StoredFulfilmentAggregate[]>;
};
