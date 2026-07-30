import type {
  IssueInvitationInput,
  IssuedInvitation,
  InvitationScope,
  InvitationStatus,
  PlatformInvitation,
} from "@/features/invitations/domain/Invitation";
import type { ApplicationResult } from "@/lib/result/ApplicationResult";

export type InvitationStore = {
  save(invitation: PlatformInvitation): Promise<void>;
  getById(id: string): Promise<PlatformInvitation | null>;
  getByTokenHash(tokenHash: string): Promise<PlatformInvitation | null>;
  listByTarget(input: {
    scope: InvitationScope;
    targetEntityId: string;
    statuses?: InvitationStatus[];
  }): Promise<PlatformInvitation[]>;
  update(invitation: PlatformInvitation): Promise<void>;
};

export type RevokeInvitationInput = {
  invitationId: string;
  revokedBy: string;
  correlationId: string;
};

export type ResendInvitationInput = {
  invitationId: string;
  invitedBy: string;
  expiresAt: string;
  correlationId: string;
};

export type ValidateInvitationInput = {
  plaintextToken: string;
};

/**
 * Fail-safe resend: prepare (old token still valid) → email → commit|abort.
 * Commit is what invalidates the previous plaintext token.
 */
export type InvitationService = {
  issue: (
    input: IssueInvitationInput,
  ) => Promise<ApplicationResult<IssuedInvitation>>;
  validate: (
    input: ValidateInvitationInput,
  ) => Promise<ApplicationResult<PlatformInvitation>>;
  revoke: (
    input: RevokeInvitationInput,
  ) => Promise<ApplicationResult<PlatformInvitation>>;
  /** Prepare a new token without invalidating the current one. */
  prepareResend: (
    input: ResendInvitationInput,
  ) => Promise<ApplicationResult<IssuedInvitation>>;
  /** Activate the prepared token (invalidates previous plaintext). */
  commitResend: (
    invitationId: string,
  ) => Promise<ApplicationResult<PlatformInvitation>>;
  /** Discard prepared token; previous invitation remains valid. */
  abortResend: (
    invitationId: string,
  ) => Promise<ApplicationResult<PlatformInvitation>>;
  expireStale: () => Promise<ApplicationResult<number>>;
};
