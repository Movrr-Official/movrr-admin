import type { TokenRecord } from "@/features/fulfilment/application/commands/tokenService";
import type { TokenStore } from "@/features/fulfilment/application/contracts/TokenStore";

export function createInMemoryTokenStore(): TokenStore {
  const byId = new Map<string, TokenRecord>();
  const byHash = new Map<string, string>();
  const byFulfilment = new Map<string, string>();

  return {
    async save(record) {
      byId.set(record.tokenId, record);
      byHash.set(record.tokenHash, record.tokenId);
      byFulfilment.set(record.fulfilmentId, record.tokenId);
    },
    async getById(tokenId) {
      return byId.get(tokenId) ?? null;
    },
    async getByHash(tokenHash) {
      const id = byHash.get(tokenHash);
      return id ? (byId.get(id) ?? null) : null;
    },
    async getByFulfilmentId(fulfilmentId) {
      const id = byFulfilment.get(fulfilmentId);
      return id ? (byId.get(id) ?? null) : null;
    },
  };
}
