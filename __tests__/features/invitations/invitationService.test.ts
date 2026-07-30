import { describe, expect, it } from "vitest";
import {
  createInvitationService,
  hashInvitationToken,
} from "@/features/invitations/application/commands/invitationService";
import { createInMemoryInvitationStore } from "@/features/invitations/infrastructure/inMemoryInvitationStore";
import { INVITATION_SCOPES } from "@/features/invitations/domain/Invitation";

describe("invitationService", () => {
  it("issues hashed tokens and never stores plaintext", async () => {
    const store = createInMemoryInvitationStore();
    const service = createInvitationService({ store });

    const issued = await service.issue({
      scope: INVITATION_SCOPES.WORKBOARD_TEAM,
      targetEntityId: "11111111-1111-1111-1111-111111111111",
      email: "Admin@movrr.nl",
      role: "editor",
      invitedBy: "22222222-2222-2222-2222-222222222222",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      correlationId: "corr-1",
    });

    expect(issued.ok).toBe(true);
    if (!issued.ok) return;

    const stored = await store.getById(issued.value.invitation.id);
    expect(stored?.email).toBe("admin@movrr.nl");
    expect(stored?.tokenHash).toBe(
      hashInvitationToken(issued.value.plaintextToken),
    );
    expect(JSON.stringify(stored)).not.toContain(issued.value.plaintextToken);
  });

  it("validates pending invites and rejects revoked", async () => {
    const store = createInMemoryInvitationStore();
    const service = createInvitationService({ store });

    const issued = await service.issue({
      scope: INVITATION_SCOPES.ORGANISATION,
      targetEntityId: "11111111-1111-1111-1111-111111111111",
      email: "user@movrr.nl",
      role: "member",
      invitedBy: "22222222-2222-2222-2222-222222222222",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      correlationId: "corr-2",
    });
    expect(issued.ok).toBe(true);
    if (!issued.ok) return;

    const valid = await service.validate({
      plaintextToken: issued.value.plaintextToken,
    });
    expect(valid.ok).toBe(true);

    const revoked = await service.revoke({
      invitationId: issued.value.invitation.id,
      revokedBy: "22222222-2222-2222-2222-222222222222",
      correlationId: "corr-3",
    });
    expect(revoked.ok).toBe(true);

    const afterRevoke = await service.validate({
      plaintextToken: issued.value.plaintextToken,
    });
    expect(afterRevoke.ok).toBe(false);
    if (!afterRevoke.ok) {
      expect(afterRevoke.kind).toBe("revoked");
    }
  });

  it("fail-safe resend keeps old token valid until commit", async () => {
    const store = createInMemoryInvitationStore();
    const service = createInvitationService({ store });

    const first = await service.issue({
      scope: INVITATION_SCOPES.WORKBOARD_TEAM,
      targetEntityId: "11111111-1111-1111-1111-111111111111",
      email: "user@movrr.nl",
      role: "viewer",
      invitedBy: "22222222-2222-2222-2222-222222222222",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      correlationId: "corr-4",
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const prepared = await service.prepareResend({
      invitationId: first.value.invitation.id,
      invitedBy: "22222222-2222-2222-2222-222222222222",
      expiresAt: new Date(Date.now() + 120_000).toISOString(),
      correlationId: "corr-5",
    });
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;

    // Old token still valid before commit
    const oldStillValid = await service.validate({
      plaintextToken: first.value.plaintextToken,
    });
    expect(oldStillValid.ok).toBe(true);

    // New token not active yet
    const newNotActive = await service.validate({
      plaintextToken: prepared.value.plaintextToken,
    });
    expect(newNotActive.ok).toBe(false);

    // Abort preserves old
    const aborted = await service.abortResend(first.value.invitation.id);
    expect(aborted.ok).toBe(true);
    const afterAbort = await service.validate({
      plaintextToken: first.value.plaintextToken,
    });
    expect(afterAbort.ok).toBe(true);

    // Prepare again and commit
    const prepared2 = await service.prepareResend({
      invitationId: first.value.invitation.id,
      invitedBy: "22222222-2222-2222-2222-222222222222",
      expiresAt: new Date(Date.now() + 120_000).toISOString(),
      correlationId: "corr-6",
    });
    expect(prepared2.ok).toBe(true);
    if (!prepared2.ok) return;

    const committed = await service.commitResend(first.value.invitation.id);
    expect(committed.ok).toBe(true);

    const oldDead = await service.validate({
      plaintextToken: first.value.plaintextToken,
    });
    expect(oldDead.ok).toBe(false);

    const newLive = await service.validate({
      plaintextToken: prepared2.value.plaintextToken,
    });
    expect(newLive.ok).toBe(true);
  });
});
