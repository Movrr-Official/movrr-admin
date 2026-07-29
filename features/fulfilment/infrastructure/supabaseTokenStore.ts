import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import type {
  TokenRecord,
  TokenStatus,
  TokenType,
} from "@/features/fulfilment/application/commands/tokenService";
import type { TokenStore } from "@/features/fulfilment/application/contracts/TokenStore";

type TokenRow = {
  id: string;
  fulfilment_id: string;
  token_type: TokenType;
  token_hash: string;
  status: TokenStatus;
  expires_at: string | null;
  consumed_at: string | null;
  revoked_at: string | null;
};

function mapRow(row: TokenRow): TokenRecord {
  return {
    tokenId: row.id,
    fulfilmentId: row.fulfilment_id,
    tokenType: row.token_type,
    tokenHash: row.token_hash,
    status: row.status,
    expiresAt: row.expires_at,
    consumedAt: row.consumed_at,
    revokedAt: row.revoked_at,
  };
}

function throwOnError(error: { message: string } | null, action: string): void {
  if (error) throw new Error(`${action}: ${error.message}`);
}

export function createSupabaseTokenStore(): TokenStore {
  return {
    async save(record) {
      const supabase = createSupabaseAdminClient();
      const { error } = await supabase.from("fulfilment_token").upsert(
        {
          id: record.tokenId,
          fulfilment_id: record.fulfilmentId,
          token_type: record.tokenType,
          token_hash: record.tokenHash,
          status: record.status,
          expires_at: record.expiresAt,
          consumed_at: record.consumedAt,
          revoked_at: record.revokedAt,
        },
        { onConflict: "id" },
      );
      throwOnError(error, "token.save");
    },

    async getById(tokenId) {
      const supabase = createSupabaseAdminClient();
      const { data, error } = await supabase
        .from("fulfilment_token")
        .select(
          "id, fulfilment_id, token_type, token_hash, status, expires_at, consumed_at, revoked_at",
        )
        .eq("id", tokenId)
        .maybeSingle();
      throwOnError(error, "token.getById");
      return data ? mapRow(data as TokenRow) : null;
    },

    async getByHash(tokenHash) {
      const supabase = createSupabaseAdminClient();
      const { data, error } = await supabase
        .from("fulfilment_token")
        .select(
          "id, fulfilment_id, token_type, token_hash, status, expires_at, consumed_at, revoked_at",
        )
        .eq("token_hash", tokenHash)
        .maybeSingle();
      throwOnError(error, "token.getByHash");
      return data ? mapRow(data as TokenRow) : null;
    },
  };
}
