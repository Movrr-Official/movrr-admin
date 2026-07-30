/**
 * Platform invitation domain — reusable across Workboard, organisations, partners.
 * Scope-specific membership activation lives in adapters, not here.
 */

export const INVITATION_STATUSES = [
  "pending",
  "accepted",
  "expired",
  "revoked",
  "rejected",
] as const;

export type InvitationStatus = (typeof INVITATION_STATUSES)[number];

/** Well-known scopes. New products add a scope string without changing the core table. */
export const INVITATION_SCOPES = {
  WORKBOARD_TEAM: "workboard_team",
  ORGANISATION: "organisation",
  PARTNER_OPS: "partner_ops",
  ADVERTISER_TEAM: "advertiser_team",
} as const;

export type InvitationScope =
  | (typeof INVITATION_SCOPES)[keyof typeof INVITATION_SCOPES]
  | (string & {});

export type PlatformInvitation = {
  id: string;
  scope: InvitationScope;
  targetEntityId: string;
  email: string;
  role: string;
  tokenHash: string;
  status: InvitationStatus;
  invitedBy: string;
  acceptedBy: string | null;
  acceptedAt: string | null;
  revokedAt: string | null;
  revokedBy: string | null;
  expiresAt: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type IssueInvitationInput = {
  scope: InvitationScope;
  targetEntityId: string;
  email: string;
  role: string;
  invitedBy: string;
  expiresAt: string;
  metadata?: Record<string, unknown>;
  correlationId: string;
};

export type IssuedInvitation = {
  invitation: PlatformInvitation;
  /** Plaintext token — returned once; never persisted. */
  plaintextToken: string;
};

export function deriveInvitationStatus(
  invitation: Pick<PlatformInvitation, "status" | "expiresAt">,
  now = new Date(),
): InvitationStatus {
  if (invitation.status === "pending" && new Date(invitation.expiresAt) < now) {
    return "expired";
  }
  return invitation.status;
}
