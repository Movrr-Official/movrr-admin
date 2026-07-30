import "server-only";

import { randomUUID } from "crypto";
import {
  generateInvitationPlaintext,
  hashInvitationToken,
} from "@/features/invitations/application/commands/invitationService";
import { INVITATION_SCOPES } from "@/features/invitations/domain/Invitation";
import { composeInvitationService } from "@/features/invitations/infrastructure/composeInvitationsModule";
import { assertPlatformInvitationsReady } from "@/features/invitations/infrastructure/platformInvitationsReadiness";
import { createSupabaseInvitationStore } from "@/features/invitations/infrastructure/supabaseInvitationStore";
import { appendPlatformAuditRecordSafe } from "@/features/platform/infrastructure/supabasePlatformAudit";
import type { RequestContext } from "@/features/identity/domain/Principal";
import { ADMIN_MODERATOR_ROLES } from "@/lib/authPermissions";
import { APP_URL, FROM_EMAIL, RESEND_API_KEY } from "@/lib/env";
import {
  getPlatformSecurityPolicy,
  isInviteDomainAllowed,
} from "@/lib/platformSettings";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { writeUserActivity } from "@/lib/userActivity";
import { fail, ok, type ApplicationResult } from "@/lib/result/ApplicationResult";
import { Resend } from "resend";

export const WORKBOARD_INVITE_ELIGIBLE_ROLES = ADMIN_MODERATOR_ROLES;

export type WorkboardInviteRole = "owner" | "admin" | "editor" | "viewer";

export type WorkboardAcceptOutcome = "accepted" | "already_accepted";

export type WorkboardAcceptSuccess = {
  status: WorkboardAcceptOutcome;
  teamId: string;
  membershipId: string;
  role: string;
  invitationId: string;
};

const INVITE_TTL_MS = 1000 * 60 * 60 * 24 * 7;

async function requireInvitationsSchema() {
  const readiness = await assertPlatformInvitationsReady();
  if (!readiness.ok) {
    return readiness;
  }
  return ok(readiness.value);
}

function buildAuditCtx(input: {
  userId: string;
  email: string | null;
  correlationId: string;
}): RequestContext {
  return {
    principal: {
      type: "admin",
      userId: input.userId,
      email: input.email,
      adminUserId: input.userId,
      role: "admin",
    },
    correlationId: input.correlationId,
    permissions: [],
    audit: {
      actorUserId: input.userId,
      actorEmail: input.email,
      principalType: "admin",
    },
  };
}

async function auditInviteEvent(input: {
  actorUserId: string;
  actorEmail: string | null;
  correlationId: string;
  capability: string;
  invitationId: string;
  previousState?: Record<string, unknown> | null;
  resultingState?: Record<string, unknown> | null;
  reason?: string;
  activityUserId?: string;
  activityAction?: string;
  activityDescription?: string;
}) {
  await appendPlatformAuditRecordSafe({
    ctx: buildAuditCtx({
      userId: input.actorUserId,
      email: input.actorEmail,
      correlationId: input.correlationId,
    }),
    capability: input.capability,
    targetEntityType: "platform_invitation",
    targetEntityId: input.invitationId,
    previousState: input.previousState,
    resultingState: input.resultingState,
    reason: input.reason,
  });

  if (input.activityUserId && input.activityAction && input.activityDescription) {
    const supabase = createSupabaseAdminClient();
    await writeUserActivity(supabase, {
      user_id: input.activityUserId,
      actor_user_id: input.actorUserId,
      source: "admin",
      action: input.activityAction,
      description: input.activityDescription,
      related_entity_type: "platform_invitation",
      related_entity_id: input.invitationId,
      metadata: {
        scope: INVITATION_SCOPES.WORKBOARD_TEAM,
        correlationId: input.correlationId,
      },
    }).catch(() => undefined);
  }
}

export function buildWorkboardInviteUrl(plaintextToken: string): string {
  const url = new URL("/workboard/invite", APP_URL);
  url.searchParams.set("token", plaintextToken);
  return url.toString();
}

async function sendWorkboardInviteEmail(input: {
  email: string;
  inviteUrl: string;
  role: string;
  expiresAt: string;
}): Promise<ApplicationResult<{ sent: true }>> {
  if (!RESEND_API_KEY) {
    return fail(
      "email_not_configured",
      "Invitation email cannot be sent: RESEND_API_KEY is not configured.",
    );
  }

  const resend = new Resend(RESEND_API_KEY);
  const expiresLabel = new Date(input.expiresAt).toUTCString();
  const { error } = await resend.emails.send({
    from: FROM_EMAIL ? `MOVRR <${FROM_EMAIL}>` : "MOVRR <no-reply@movrr.nl>",
    to: input.email,
    subject: "You have been invited to the MOVRR Workboard",
    html: `
      <p>You have been invited to join the MOVRR Workboard as <strong>${input.role}</strong>.</p>
      <p>This invitation is for existing MOVRR admin platform users (admin, super admin, or moderator) and expires on <strong>${expiresLabel}</strong>.</p>
      <p><a href="${input.inviteUrl}">Accept invite</a></p>
      <p>If you are signed in with a different account, sign out and use the invited email address.</p>
    `,
  });

  if (error) {
    return fail(
      "email_failed",
      error.message || "Failed to send invitation email",
    );
  }
  return ok({ sent: true });
}

/**
 * Option A: invitee must already be an eligible platform admin.
 * Exact email match only (H6) — no pattern matching.
 */
export async function assertEligibleWorkboardInvitee(
  email: string,
): Promise<
  ApplicationResult<{ userId: string; email: string; role: string }>
> {
  const supabase = createSupabaseAdminClient();
  const normalized = email.trim().toLowerCase();
  const { data, error } = await supabase
    .from("admin_users")
    .select("user_id, email, role")
    .eq("email", normalized)
    .maybeSingle();

  if (error) {
    return fail("lookup_failed", "Unable to validate invitee identity");
  }
  if (!data?.user_id || !data.email) {
    return fail(
      "not_provisioned",
      "Workboard invites require an existing MOVRR admin account (admin, super admin, or moderator). Create the user in Admin → Users first.",
    );
  }

  if (data.email.toLowerCase() !== normalized) {
    return fail("email_mismatch", "Invitee email does not match platform identity");
  }

  const role = String(data.role || "").toLowerCase();
  if (!(WORKBOARD_INVITE_ELIGIBLE_ROLES as readonly string[]).includes(role)) {
    return fail(
      "ineligible_role",
      `This user has platform role "${role}" and cannot join Workboard. Eligible roles: ${WORKBOARD_INVITE_ELIGIBLE_ROLES.join(", ")}.`,
    );
  }

  return ok({
    userId: data.user_id,
    email: normalized,
    role,
  });
}

export async function issueWorkboardInvitation(input: {
  teamId: string;
  email: string;
  role: WorkboardInviteRole;
  invitedByUserId: string;
  invitedByEmail: string | null;
  actorWorkboardRole: string;
}): Promise<
  ApplicationResult<{ invitationId: string; emailSent: boolean; expiresAt: string }>
> {
  const schema = await requireInvitationsSchema();
  if (!schema.ok) return schema;

  const correlationId = randomUUID();
  const securityPolicy = await getPlatformSecurityPolicy();

  if (
    !isInviteDomainAllowed(input.email, securityPolicy.inviteDomainAllowlist)
  ) {
    return fail(
      "domain_blocked",
      "This invite email domain is not allowed by the current security policy.",
    );
  }

  if (!["owner", "admin"].includes(input.actorWorkboardRole)) {
    return fail("not_authorized", "Not authorized to invite members");
  }

  if (input.role === "owner" && input.actorWorkboardRole !== "owner") {
    return fail("not_authorized", "Only owners can invite another owner");
  }

  const eligible = await assertEligibleWorkboardInvitee(input.email);
  if (!eligible.ok) {
    return eligible;
  }

  const supabase = createSupabaseAdminClient();
  const { data: existingMember } = await supabase
    .from("workboard_team_members")
    .select("id, status")
    .eq("team_id", input.teamId)
    .eq("user_id", eligible.value.userId)
    .maybeSingle();

  if (existingMember?.status === "active") {
    return fail(
      "already_member",
      "This user is already an active Workboard member",
    );
  }

  const store = createSupabaseInvitationStore(supabase);
  const invitations = composeInvitationService(supabase);
  await invitations.expireStale();

  const existingPending = (
    await store.listByTarget({
      scope: INVITATION_SCOPES.WORKBOARD_TEAM,
      targetEntityId: input.teamId,
      statuses: ["pending"],
    })
  ).find((row) => row.email === eligible.value.email);

  // H5: one pending per scope/target/email — resend instead of creating duplicates
  if (existingPending) {
    return fail(
      "duplicate_pending",
      "A pending invitation already exists for this email. Use Resend instead of creating another invite.",
    );
  }

  const expiresAt = new Date(Date.now() + INVITE_TTL_MS).toISOString();
  const issued = await invitations.issue({
    scope: INVITATION_SCOPES.WORKBOARD_TEAM,
    targetEntityId: input.teamId,
    email: eligible.value.email,
    role: input.role,
    invitedBy: input.invitedByUserId,
    expiresAt,
    correlationId,
    metadata: {
      inviteeUserId: eligible.value.userId,
      inviteePlatformRole: eligible.value.role,
    },
  });

  if (!issued.ok) {
    return issued;
  }

  const emailResult = await sendWorkboardInviteEmail({
    email: eligible.value.email,
    inviteUrl: buildWorkboardInviteUrl(issued.value.plaintextToken),
    role: input.role,
    expiresAt,
  });

  if (!emailResult.ok) {
    await invitations.revoke({
      invitationId: issued.value.invitation.id,
      revokedBy: input.invitedByUserId,
      correlationId,
    });
    return emailResult;
  }

  await auditInviteEvent({
    actorUserId: input.invitedByUserId,
    actorEmail: input.invitedByEmail,
    correlationId,
    capability: "invitation.created",
    invitationId: issued.value.invitation.id,
    resultingState: {
      scope: INVITATION_SCOPES.WORKBOARD_TEAM,
      teamId: input.teamId,
      email: eligible.value.email,
      role: input.role,
      status: "pending",
      emailSent: true,
    },
    activityUserId: eligible.value.userId,
    activityAction: "Workboard invitation created",
    activityDescription: `Invited ${eligible.value.email} to Workboard as ${input.role}.`,
  });

  return ok({
    invitationId: issued.value.invitation.id,
    emailSent: true,
    expiresAt,
  });
}

export async function listWorkboardInvitations(teamId: string): Promise<
  ApplicationResult<
    Array<{
      id: string;
      email: string;
      role: string;
      status: string;
      expiresAt: string;
      createdAt: string;
      acceptedAt: string | null;
      revokedAt: string | null;
    }>
  >
> {
  const schema = await requireInvitationsSchema();
  if (!schema.ok) return schema;

  const supabase = createSupabaseAdminClient();
  const invitations = composeInvitationService(supabase);
  await invitations.expireStale();

  const store = createSupabaseInvitationStore(supabase);
  const rows = await store.listByTarget({
    scope: INVITATION_SCOPES.WORKBOARD_TEAM,
    targetEntityId: teamId,
  });

  return ok(
    rows.map((row) => ({
      id: row.id,
      email: row.email,
      role: row.role,
      status: row.status,
      expiresAt: row.expiresAt,
      createdAt: row.createdAt,
      acceptedAt: row.acceptedAt,
      revokedAt: row.revokedAt,
    })),
  );
}

export async function revokeWorkboardInvitation(input: {
  invitationId: string;
  teamId: string;
  revokedByUserId: string;
  revokedByEmail: string | null;
}): Promise<ApplicationResult<{ invitationId: string }>> {
  const schema = await requireInvitationsSchema();
  if (!schema.ok) return schema;

  const correlationId = randomUUID();
  const supabase = createSupabaseAdminClient();
  const invitations = composeInvitationService(supabase);
  const store = createSupabaseInvitationStore(supabase);
  const existing = await store.getById(input.invitationId);

  if (!existing || existing.targetEntityId !== input.teamId) {
    return fail("not_found", "Invite not found");
  }
  if (existing.scope !== INVITATION_SCOPES.WORKBOARD_TEAM) {
    return fail("wrong_scope", "Not a Workboard invitation");
  }

  const revoked = await invitations.revoke({
    invitationId: input.invitationId,
    revokedBy: input.revokedByUserId,
    correlationId,
  });
  if (!revoked.ok) {
    return revoked;
  }

  await auditInviteEvent({
    actorUserId: input.revokedByUserId,
    actorEmail: input.revokedByEmail,
    correlationId,
    capability: "invitation.revoked",
    invitationId: input.invitationId,
    previousState: { status: existing.status },
    resultingState: { status: "revoked" },
    activityUserId: input.revokedByUserId,
    activityAction: "Workboard invitation revoked",
    activityDescription: `Revoked Workboard invite for ${existing.email}.`,
  });

  return ok({ invitationId: input.invitationId });
}

/**
 * Fail-safe resend (H1/H2):
 * prepare (old token remains valid) → email → commit (activates new token)
 * On email failure: abort (old token remains valid)
 */
export async function resendWorkboardInvitation(input: {
  invitationId: string;
  teamId: string;
  invitedByUserId: string;
  invitedByEmail: string | null;
}): Promise<ApplicationResult<{ invitationId: string; emailSent: true }>> {
  const schema = await requireInvitationsSchema();
  if (!schema.ok) return schema;

  const correlationId = randomUUID();
  const supabase = createSupabaseAdminClient();
  const store = createSupabaseInvitationStore(supabase);
  const existing = await store.getById(input.invitationId);

  if (!existing || existing.targetEntityId !== input.teamId) {
    return fail("not_found", "Invite not found");
  }
  if (existing.scope !== INVITATION_SCOPES.WORKBOARD_TEAM) {
    return fail("wrong_scope", "Not a Workboard invitation");
  }

  const eligible = await assertEligibleWorkboardInvitee(existing.email);
  if (!eligible.ok) {
    return eligible;
  }

  const expiresAt = new Date(Date.now() + INVITE_TTL_MS).toISOString();
  const plaintextToken = generateInvitationPlaintext();
  const nextHash = hashInvitationToken(plaintextToken);

  const { data: prepData, error: prepError } = await supabase.rpc(
    "prepare_resend_platform_invitation",
    {
      p_invitation_id: input.invitationId,
      p_next_token_hash: nextHash,
      p_expires_at: expiresAt,
      p_invited_by: input.invitedByUserId,
    },
  );

  if (prepError) {
    return fail(
      "rpc_failed",
      "Unable to prepare invitation resend. Confirm Migration 050 is applied.",
    );
  }

  const prepRow = (Array.isArray(prepData) ? prepData[0] : prepData) as {
    success: boolean;
    error_code: string | null;
    error_message: string | null;
  } | null;

  if (!prepRow?.success) {
    return fail(
      prepRow?.error_code || "prepare_failed",
      prepRow?.error_message || "Unable to prepare invitation resend",
    );
  }

  const emailResult = await sendWorkboardInviteEmail({
    email: existing.email,
    inviteUrl: buildWorkboardInviteUrl(plaintextToken),
    role: existing.role,
    expiresAt,
  });

  if (!emailResult.ok) {
    await supabase.rpc("abort_resend_platform_invitation", {
      p_invitation_id: input.invitationId,
    });
    await auditInviteEvent({
      actorUserId: input.invitedByUserId,
      actorEmail: input.invitedByEmail,
      correlationId,
      capability: "invitation.resend_failed",
      invitationId: input.invitationId,
      reason: emailResult.message,
      resultingState: { previousInvitePreserved: true },
      activityUserId: input.invitedByUserId,
      activityAction: "Workboard invitation resend failed",
      activityDescription: `Resend failed for ${existing.email}; previous invite remains valid.`,
    });
    return emailResult;
  }

  const { data: commitData, error: commitError } = await supabase.rpc(
    "commit_resend_platform_invitation",
    { p_invitation_id: input.invitationId },
  );

  if (commitError) {
    await supabase.rpc("abort_resend_platform_invitation", {
      p_invitation_id: input.invitationId,
    });
    return fail(
      "rpc_failed",
      "Invitation email was sent but activation failed. Previous invite remains valid; retry resend.",
    );
  }

  const commitRow = (Array.isArray(commitData) ? commitData[0] : commitData) as {
    success: boolean;
    error_code: string | null;
    error_message: string | null;
  } | null;

  if (!commitRow?.success) {
    await supabase.rpc("abort_resend_platform_invitation", {
      p_invitation_id: input.invitationId,
    });
    return fail(
      commitRow?.error_code || "commit_failed",
      commitRow?.error_message ||
        "Invitation email was sent but activation failed. Previous invite remains valid; retry resend.",
    );
  }

  await auditInviteEvent({
    actorUserId: input.invitedByUserId,
    actorEmail: input.invitedByEmail,
    correlationId,
    capability: "invitation.resent",
    invitationId: input.invitationId,
    resultingState: { status: "pending", emailSent: true, expiresAt },
    activityUserId: eligible.value.userId,
    activityAction: "Workboard invitation resent",
    activityDescription: `Resent Workboard invite to ${existing.email}.`,
  });

  return ok({
    invitationId: input.invitationId,
    emailSent: true,
  });
}

type AcceptRpcRow = {
  success: boolean;
  error_code: string | null;
  error_message: string | null;
  invitation_id: string | null;
  team_id: string | null;
  membership_id: string | null;
  membership_role: string | null;
  result_status: string | null;
};

export async function acceptWorkboardInvitation(input: {
  plaintextToken: string;
  userId: string;
  email: string;
}): Promise<ApplicationResult<WorkboardAcceptSuccess>> {
  const schema = await requireInvitationsSchema();
  if (!schema.ok) return schema;

  const correlationId = randomUUID();
  const supabase = createSupabaseAdminClient();
  const tokenHash = hashInvitationToken(input.plaintextToken);
  const normalizedEmail = input.email.trim().toLowerCase();

  const { data, error } = await supabase.rpc(
    "accept_workboard_platform_invitation",
    {
      p_token_hash: tokenHash,
      p_user_id: input.userId,
      p_email: normalizedEmail,
    },
  );

  if (error) {
    await auditInviteEvent({
      actorUserId: input.userId,
      actorEmail: normalizedEmail,
      correlationId,
      capability: "invitation.accept_failed",
      invitationId: "unknown",
      reason: "rpc_failed",
      resultingState: { correlationId },
      activityUserId: input.userId,
      activityAction: "Workboard invitation acceptance failed",
      activityDescription: "Acceptance RPC failed",
    });
    return fail(
      "rpc_failed",
      "Unable to accept invitation. Confirm Migration 050 is applied.",
    );
  }

  const row = (Array.isArray(data) ? data[0] : data) as AcceptRpcRow | null;
  if (!row) {
    return fail("rpc_failed", "Empty accept response");
  }

  if (!row.success) {
    const code = row.error_code || "accept_failed";
    const message = row.error_message || "Unable to accept invitation";

    await auditInviteEvent({
      actorUserId: input.userId,
      actorEmail: normalizedEmail,
      correlationId,
      capability:
        code === "email_mismatch"
          ? "invitation.auth_mismatch"
          : "invitation.accept_failed",
      invitationId: row.invitation_id || "unknown",
      reason: message,
      resultingState: { errorCode: code },
      activityUserId: input.userId,
      activityAction: "Workboard invitation acceptance failed",
      activityDescription: message,
    });

    return fail(code, message);
  }

  if (!row.team_id || !row.membership_id || !row.invitation_id) {
    return fail(
      "membership_unconfirmed",
      "Acceptance did not confirm Workboard membership",
    );
  }

  // Trust RPC verification; only confirm membership id shape (avoid false failure after commit)
  if (
    row.result_status !== "accepted" &&
    row.result_status !== "already_accepted"
  ) {
    return fail(
      "membership_unconfirmed",
      "Acceptance did not confirm Workboard membership",
    );
  }

  const status: WorkboardAcceptOutcome =
    row.result_status === "already_accepted" ? "already_accepted" : "accepted";

  await auditInviteEvent({
    actorUserId: input.userId,
    actorEmail: normalizedEmail,
    correlationId,
    capability: "invitation.accepted",
    invitationId: row.invitation_id,
    resultingState: {
      teamId: row.team_id,
      membershipId: row.membership_id,
      role: row.membership_role,
      status,
    },
    activityUserId: input.userId,
    activityAction:
      status === "already_accepted"
        ? "Workboard invitation already accepted"
        : "Workboard invitation accepted",
    activityDescription:
      status === "already_accepted"
        ? "Opened Workboard via an already-accepted invitation."
        : `Joined Workboard as ${row.membership_role}.`,
  });

  if (status === "accepted") {
    await auditInviteEvent({
      actorUserId: input.userId,
      actorEmail: normalizedEmail,
      correlationId,
      capability: "membership.activated",
      invitationId: row.invitation_id,
      resultingState: {
        membershipId: row.membership_id,
        teamId: row.team_id,
        role: row.membership_role,
      },
      activityUserId: input.userId,
      activityAction: "Workboard membership activated",
      activityDescription: `Membership activated for team ${row.team_id}.`,
    });
  }

  return ok({
    status,
    teamId: row.team_id,
    membershipId: row.membership_id,
    role: String(row.membership_role || ""),
    invitationId: row.invitation_id,
  });
}
