import type { TokenRecord } from "@/features/fulfilment/application/commands/tokenService";

export type TokenStore = {
  save(record: TokenRecord): Promise<void>;
  getById(tokenId: string): Promise<TokenRecord | null>;
  getByHash(tokenHash: string): Promise<TokenRecord | null>;
  /** Latest token for a fulfilment (display / ops). */
  getByFulfilmentId(fulfilmentId: string): Promise<TokenRecord | null>;
};
