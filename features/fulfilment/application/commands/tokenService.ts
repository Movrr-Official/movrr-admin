import { createHash, randomBytes, randomUUID } from "crypto";
import type { DomainEventBus } from "@/lib/events/DomainEventBus";
import { fail, ok, type ApplicationResult } from "@/lib/result/ApplicationResult";
import type { TokenStore } from "@/features/fulfilment/application/contracts/TokenStore";
import { createInMemoryTokenStore } from "@/features/fulfilment/infrastructure/inMemoryTokenStore";

export const TOKEN_TYPES = [
  "qr",
  "barcode",
  "one_time_code",
  "deep_link",
  "short_code",
  "nfc",
] as const;

export type TokenType = (typeof TOKEN_TYPES)[number];

export type TokenStatus = "active" | "consumed" | "revoked" | "expired";

export type IssueTokenInput = {
  fulfilmentId: string;
  tokenType: TokenType;
  correlationId: string;
  expiresAt?: string | null;
};

export type IssuedToken = {
  tokenId: string;
  fulfilmentId: string;
  tokenType: TokenType;
  /** Returned once at issue; never persisted. */
  plaintext: string;
  tokenHash: string;
  status: TokenStatus;
  expiresAt: string | null;
};

export type ConsumeTokenInput = {
  plaintext: string;
  correlationId: string;
};

export type RevokeTokenInput = {
  tokenId: string;
  correlationId: string;
};

export type TokenRecord = {
  tokenId: string;
  fulfilmentId: string;
  tokenType: TokenType;
  tokenHash: string;
  status: TokenStatus;
  expiresAt: string | null;
  consumedAt: string | null;
  revokedAt: string | null;
};

/**
 * Secure token ops. Publishes domain events only — never mutates Fulfilment.state.
 * Handlers/engine request SM transitions in response to events.
 */
export type TokenService = {
  issue: (input: IssueTokenInput) => Promise<ApplicationResult<IssuedToken>>;
  consume: (
    input: ConsumeTokenInput,
  ) => Promise<ApplicationResult<TokenRecord>>;
  revoke: (input: RevokeTokenInput) => Promise<ApplicationResult<TokenRecord>>;
};

export type TokenServiceDeps = {
  eventBus: DomainEventBus;
  store?: TokenStore;
};

function hashToken(plaintext: string): string {
  return createHash("sha256").update(plaintext).digest("hex");
}

function generatePlaintext(): string {
  return randomBytes(24).toString("base64url");
}

export function createTokenService(deps: TokenServiceDeps): TokenService {
  const store = deps.store ?? createInMemoryTokenStore();

  return {
    async issue(input: IssueTokenInput): Promise<ApplicationResult<IssuedToken>> {
      if (!input.fulfilmentId) {
        return fail("validation", "fulfilmentId is required");
      }
      if (!input.correlationId) {
        return fail("validation", "correlationId is required");
      }
      if (!TOKEN_TYPES.includes(input.tokenType)) {
        return fail("validation", "invalid tokenType");
      }

      const plaintext = generatePlaintext();
      const tokenHash = hashToken(plaintext);
      const tokenId = randomUUID();
      const record: TokenRecord = {
        tokenId,
        fulfilmentId: input.fulfilmentId,
        tokenType: input.tokenType,
        tokenHash,
        status: "active",
        expiresAt: input.expiresAt ?? null,
        consumedAt: null,
        revokedAt: null,
      };

      await store.save(record);

      deps.eventBus.enqueue({
        name: "FulfilmentTokenIssued",
        occurredAt: new Date().toISOString(),
        correlationId: input.correlationId,
        payload: {
          tokenId,
          fulfilmentId: input.fulfilmentId,
          tokenType: input.tokenType,
          tokenHash,
          expiresAt: record.expiresAt,
        },
      });

      return ok({
        tokenId,
        fulfilmentId: input.fulfilmentId,
        tokenType: input.tokenType,
        plaintext,
        tokenHash,
        status: "active",
        expiresAt: record.expiresAt,
      });
    },

    async consume(
      input: ConsumeTokenInput,
    ): Promise<ApplicationResult<TokenRecord>> {
      if (!input.plaintext) {
        return fail("validation", "plaintext is required");
      }
      if (!input.correlationId) {
        return fail("validation", "correlationId is required");
      }

      const tokenHash = hashToken(input.plaintext);
      const record = await store.getByHash(tokenHash);
      if (!record) {
        return fail("not_found", "Token not found");
      }

      if (record.status === "consumed") {
        return fail("already_consumed", "Token already consumed");
      }
      if (record.status === "revoked") {
        return fail("already_revoked", "Token already revoked");
      }
      if (record.status === "expired") {
        return fail("already_expired", "Token already expired");
      }
      if (record.expiresAt && new Date(record.expiresAt).getTime() <= Date.now()) {
        const expired: TokenRecord = {
          ...record,
          status: "expired",
        };
        await store.save(expired);
        return fail("already_expired", "Token already expired");
      }

      const updated: TokenRecord = {
        ...record,
        status: "consumed",
        consumedAt: new Date().toISOString(),
      };
      await store.save(updated);

      deps.eventBus.enqueue({
        name: "FulfilmentTokenConsumed",
        occurredAt: new Date().toISOString(),
        correlationId: input.correlationId,
        payload: {
          tokenId: record.tokenId,
          fulfilmentId: record.fulfilmentId,
          tokenHash: record.tokenHash,
        },
      });

      return ok(updated);
    },

    async revoke(
      input: RevokeTokenInput,
    ): Promise<ApplicationResult<TokenRecord>> {
      if (!input.tokenId) {
        return fail("validation", "tokenId is required");
      }
      if (!input.correlationId) {
        return fail("validation", "correlationId is required");
      }

      const record = await store.getById(input.tokenId);
      if (!record) {
        return fail("not_found", "Token not found");
      }
      if (record.status === "revoked") {
        return fail("already_revoked", "Token already revoked");
      }
      if (record.status === "consumed") {
        return fail("already_consumed", "Token already consumed");
      }

      const updated: TokenRecord = {
        ...record,
        status: "revoked",
        revokedAt: new Date().toISOString(),
      };
      await store.save(updated);

      deps.eventBus.enqueue({
        name: "FulfilmentTokenRevoked",
        occurredAt: new Date().toISOString(),
        correlationId: input.correlationId,
        payload: {
          tokenId: input.tokenId,
          fulfilmentId: record.fulfilmentId,
          tokenHash: record.tokenHash,
        },
      });

      return ok(updated);
    },
  };
}
