import type { TokenRecord } from "@/features/fulfilment/application/commands/tokenService";

export type TokenStore = {
  save(record: TokenRecord): Promise<void>;
  getById(tokenId: string): Promise<TokenRecord | null>;
  getByHash(tokenHash: string): Promise<TokenRecord | null>;
};
