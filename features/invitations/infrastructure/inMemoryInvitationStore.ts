import type { InvitationStore } from "@/features/invitations/application/contracts/InvitationService";
import type {
  InvitationScope,
  InvitationStatus,
  PlatformInvitation,
} from "@/features/invitations/domain/Invitation";

export function createInMemoryInvitationStore(
  seed: PlatformInvitation[] = [],
): InvitationStore {
  const byId = new Map<string, PlatformInvitation>(
    seed.map((row) => [row.id, structuredClone(row)]),
  );

  return {
    async save(invitation) {
      byId.set(invitation.id, structuredClone(invitation));
    },
    async getById(id) {
      const row = byId.get(id);
      return row ? structuredClone(row) : null;
    },
    async getByTokenHash(tokenHash) {
      for (const row of byId.values()) {
        if (row.tokenHash === tokenHash) return structuredClone(row);
      }
      return null;
    },
    async listByTarget({ scope, targetEntityId, statuses }) {
      return [...byId.values()]
        .filter((row) => row.scope === scope && row.targetEntityId === targetEntityId)
        .filter((row) =>
          statuses?.length ? statuses.includes(row.status as InvitationStatus) : true,
        )
        .map((row) => structuredClone(row))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },
    async update(invitation) {
      if (!byId.has(invitation.id)) {
        throw new Error("Invitation not found");
      }
      byId.set(invitation.id, structuredClone(invitation));
    },
  };
}

export type { InvitationScope };
