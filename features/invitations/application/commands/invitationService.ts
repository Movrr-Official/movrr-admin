import { createHash, randomBytes, randomUUID } from "crypto";
import type {
  InvitationService,
  InvitationStore,
  ResendInvitationInput,
  RevokeInvitationInput,
  ValidateInvitationInput,
} from "@/features/invitations/application/contracts/InvitationService";
import type {
  IssueInvitationInput,
  IssuedInvitation,
  PlatformInvitation,
} from "@/features/invitations/domain/Invitation";
import { deriveInvitationStatus } from "@/features/invitations/domain/Invitation";
import { fail, ok, type ApplicationResult } from "@/lib/result/ApplicationResult";

export function hashInvitationToken(plaintext: string): string {
  return createHash("sha256").update(plaintext).digest("hex");
}

export function generateInvitationPlaintext(): string {
  return randomBytes(24).toString("base64url");
}

export type InvitationServiceDeps = {
  store: InvitationStore;
  expireStaleInStore?: () => Promise<number>;
};

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

const NEXT_HASH_KEY = "next_token_hash";
const NEXT_EXPIRES_KEY = "next_expires_at";

export function createInvitationService(
  deps: InvitationServiceDeps,
): InvitationService {
  const { store } = deps;

  return {
    async issue(
      input: IssueInvitationInput,
    ): Promise<ApplicationResult<IssuedInvitation>> {
      if (!input.scope?.trim()) {
        return fail("validation", "Invitation scope is required");
      }
      if (!input.targetEntityId?.trim()) {
        return fail("validation", "targetEntityId is required");
      }
      if (!input.email?.trim() || !input.email.includes("@")) {
        return fail("validation", "A valid invite email is required");
      }
      if (!input.role?.trim()) {
        return fail("validation", "Invitation role is required");
      }
      if (!input.invitedBy?.trim()) {
        return fail("validation", "invitedBy is required");
      }
      if (!input.correlationId?.trim()) {
        return fail("validation", "correlationId is required");
      }
      if (!input.expiresAt || Number.isNaN(new Date(input.expiresAt).getTime())) {
        return fail("validation", "expiresAt must be a valid ISO timestamp");
      }
      if (new Date(input.expiresAt) <= new Date()) {
        return fail("validation", "expiresAt must be in the future");
      }

      const plaintextToken = generateInvitationPlaintext();
      const now = new Date().toISOString();
      const invitation: PlatformInvitation = {
        id: randomUUID(),
        scope: input.scope,
        targetEntityId: input.targetEntityId,
        email: normalizeEmail(input.email),
        role: input.role,
        tokenHash: hashInvitationToken(plaintextToken),
        status: "pending",
        invitedBy: input.invitedBy,
        acceptedBy: null,
        acceptedAt: null,
        revokedAt: null,
        revokedBy: null,
        expiresAt: input.expiresAt,
        metadata: {
          ...(input.metadata ?? {}),
          correlationId: input.correlationId,
        },
        createdAt: now,
        updatedAt: now,
      };

      try {
        await store.save(invitation);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (
          message.toLowerCase().includes("duplicate") ||
          message.toLowerCase().includes("unique")
        ) {
          return fail(
            "duplicate_pending",
            "A pending invitation already exists for this recipient. Resend it instead.",
          );
        }
        throw error;
      }

      return ok({ invitation, plaintextToken });
    },

    async validate(
      input: ValidateInvitationInput,
    ): Promise<ApplicationResult<PlatformInvitation>> {
      if (!input.plaintextToken?.trim()) {
        return fail("invalid_token", "Invitation token is required");
      }

      if (deps.expireStaleInStore) {
        await deps.expireStaleInStore().catch(() => 0);
      }

      const record = await store.getByTokenHash(
        hashInvitationToken(input.plaintextToken),
      );
      if (!record) {
        return fail("not_found", "Invite not found");
      }

      const status = deriveInvitationStatus(record);
      if (status === "expired" && record.status === "pending") {
        const expired: PlatformInvitation = {
          ...record,
          status: "expired",
          updatedAt: new Date().toISOString(),
        };
        await store.update(expired);
        return fail("expired", "Invite expired");
      }
      if (status === "expired") {
        return fail("expired", "Invite expired");
      }
      if (status === "revoked") {
        return fail("revoked", "This invitation has been revoked");
      }
      if (status === "rejected") {
        return fail("rejected", "This invitation was rejected");
      }
      if (status === "accepted") {
        return fail("already_accepted", "Invite already accepted");
      }
      if (status !== "pending") {
        return fail(
          "invalid_status",
          "Invitation cannot be used in its current state",
        );
      }

      return ok(record);
    },

    async revoke(
      input: RevokeInvitationInput,
    ): Promise<ApplicationResult<PlatformInvitation>> {
      if (!input.invitationId?.trim()) {
        return fail("validation", "invitationId is required");
      }
      if (!input.revokedBy?.trim()) {
        return fail("validation", "revokedBy is required");
      }

      const record = await store.getById(input.invitationId);
      if (!record) {
        return fail("not_found", "Invite not found");
      }
      if (record.status === "revoked") {
        return fail("already_revoked", "Invitation already revoked");
      }
      if (record.status === "accepted") {
        return fail("already_accepted", "Accepted invitations cannot be revoked");
      }

      const updated: PlatformInvitation = {
        ...record,
        status: "revoked",
        revokedAt: new Date().toISOString(),
        revokedBy: input.revokedBy,
        updatedAt: new Date().toISOString(),
        metadata: {
          ...record.metadata,
          [NEXT_HASH_KEY]: undefined,
          [NEXT_EXPIRES_KEY]: undefined,
        },
      };
      // Strip prepare keys cleanly
      const { [NEXT_HASH_KEY]: _a, [NEXT_EXPIRES_KEY]: _b, next_prepared_by: _c, next_prepared_at: _d, ...rest } =
        updated.metadata as Record<string, unknown>;
      updated.metadata = rest;

      await store.update(updated);
      return ok(updated);
    },

    async prepareResend(
      input: ResendInvitationInput,
    ): Promise<ApplicationResult<IssuedInvitation>> {
      if (!input.invitationId?.trim()) {
        return fail("validation", "invitationId is required");
      }
      if (!input.expiresAt || new Date(input.expiresAt) <= new Date()) {
        return fail("validation", "expiresAt must be in the future");
      }

      const existing = await store.getById(input.invitationId);
      if (!existing) {
        return fail("not_found", "Invite not found");
      }
      if (existing.status === "accepted") {
        return fail("already_accepted", "Accepted invitations cannot be resent");
      }
      if (existing.status === "revoked") {
        return fail("revoked", "Revoked invitations cannot be resent");
      }

      const plaintextToken = generateInvitationPlaintext();
      const prepared: PlatformInvitation = {
        ...existing,
        status: "pending",
        updatedAt: new Date().toISOString(),
        metadata: {
          ...existing.metadata,
          [NEXT_HASH_KEY]: hashInvitationToken(plaintextToken),
          [NEXT_EXPIRES_KEY]: input.expiresAt,
          next_prepared_by: input.invitedBy,
          next_prepared_at: new Date().toISOString(),
          correlationId: input.correlationId,
        },
      };
      await store.update(prepared);
      return ok({ invitation: prepared, plaintextToken });
    },

    async commitResend(
      invitationId: string,
    ): Promise<ApplicationResult<PlatformInvitation>> {
      const existing = await store.getById(invitationId);
      if (!existing) {
        return fail("not_found", "Invite not found");
      }

      const nextHash = existing.metadata[NEXT_HASH_KEY];
      const nextExpires = existing.metadata[NEXT_EXPIRES_KEY];
      if (typeof nextHash !== "string" || !nextHash) {
        return fail("not_prepared", "No prepared resend to commit");
      }
      if (typeof nextExpires !== "string" || !nextExpires) {
        return fail("not_prepared", "No prepared resend expiry to commit");
      }

      const {
        [NEXT_HASH_KEY]: _h,
        [NEXT_EXPIRES_KEY]: _e,
        next_prepared_by: _b,
        next_prepared_at: _a,
        ...rest
      } = existing.metadata as Record<string, unknown>;

      const committed: PlatformInvitation = {
        ...existing,
        tokenHash: nextHash,
        expiresAt: nextExpires,
        status: "pending",
        revokedAt: null,
        revokedBy: null,
        updatedAt: new Date().toISOString(),
        metadata: {
          ...rest,
          lastResentAt: new Date().toISOString(),
        },
      };
      await store.update(committed);
      return ok(committed);
    },

    async abortResend(
      invitationId: string,
    ): Promise<ApplicationResult<PlatformInvitation>> {
      const existing = await store.getById(invitationId);
      if (!existing) {
        return fail("not_found", "Invite not found");
      }

      const {
        [NEXT_HASH_KEY]: _h,
        [NEXT_EXPIRES_KEY]: _e,
        next_prepared_by: _b,
        next_prepared_at: _a,
        ...rest
      } = existing.metadata as Record<string, unknown>;

      const aborted: PlatformInvitation = {
        ...existing,
        updatedAt: new Date().toISOString(),
        metadata: rest,
      };
      await store.update(aborted);
      return ok(aborted);
    },

    async expireStale(): Promise<ApplicationResult<number>> {
      if (!deps.expireStaleInStore) {
        return ok(0);
      }
      const count = await deps.expireStaleInStore();
      return ok(count);
    },
  };
}
