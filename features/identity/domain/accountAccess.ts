export type AccessMembership = {
  organisationId: string;
  organisationName: string;
  membershipStatus: string;
  invitationStatus: string | null;
  invitationExpiresAt: string | null;
  lastAttemptAt: string | null;
  deliveryState: string;
  retryAt: string | null;
  canSend: boolean;
};
export type AccountAccessState = {
  userId: string;
  eligible: boolean;
  hasPassword: boolean;
  lastSignInAt: string | null;
  recoveryEnabled?: boolean;
  memberships: AccessMembership[];
};

export function accessAction(state: AccountAccessState, membership: AccessMembership) {
  if (!state.eligible || !membership.canSend) return null;
  if (membership.membershipStatus === "invited") {
    if (membership.invitationStatus && !["pending", "expired"].includes(membership.invitationStatus)) return null;
    return membership.invitationStatus ? "Resend Invitation" : "Send Invitation";
  }
  if (membership.membershipStatus !== "active") return null;
  // Auth credential presence and sign-in history are displayed separately.
  // Provisioning can install a random credential; presence is not proof that
  // the person completed setup. A setup link does not change that credential.
  return !state.hasPassword || !state.lastSignInAt ? "Send Setup Link" : "Reset Password";
}
