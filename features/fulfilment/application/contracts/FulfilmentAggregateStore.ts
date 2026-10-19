import type { Fulfilment } from "@/features/fulfilment/domain/Fulfilment";
type TokenType = string;

/** Engine-owned aggregate fields beyond the Fulfilment entity. */
export type StoredFulfilmentAggregate = {
  fulfilment: Fulfilment;
  resourceId: string;
  pointsCost: number;
  correlationId: string;
  tokenType: TokenType;
};

/**
 * Read port for authoritative PostgreSQL fulfillment records.
 * No state-transition writer is exposed.
 */
export type FulfilmentAggregateStore = {
  get(id: string): Promise<StoredFulfilmentAggregate | null>;
  exists(id: string): Promise<boolean>;
  list(): Promise<StoredFulfilmentAggregate[]>;
};
