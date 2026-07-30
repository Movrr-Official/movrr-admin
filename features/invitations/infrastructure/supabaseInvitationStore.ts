import "server-only";

import type { InvitationStore } from "@/features/invitations/application/contracts/InvitationService";
import type {
  InvitationScope,
  InvitationStatus,
  PlatformInvitation,
} from "@/features/invitations/domain/Invitation";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

type InvitationRow = {
  id: string;
  scope: string;
  target_entity_id: string;
  email: string;
  role: string;
  token_hash: string;
  status: InvitationStatus;
  invited_by: string;
  accepted_by: string | null;
  accepted_at: string | null;
  revoked_at: string | null;
  revoked_by: string | null;
  expires_at: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

const mapRow = (row: InvitationRow): PlatformInvitation => ({
  id: row.id,
  scope: row.scope as InvitationScope,
  targetEntityId: row.target_entity_id,
  email: row.email,
  role: row.role,
  tokenHash: row.token_hash,
  status: row.status,
  invitedBy: row.invited_by,
  acceptedBy: row.accepted_by,
  acceptedAt: row.accepted_at,
  revokedAt: row.revoked_at,
  revokedBy: row.revoked_by,
  expiresAt: row.expires_at,
  metadata: row.metadata ?? {},
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const toRow = (invitation: PlatformInvitation): InvitationRow => ({
  id: invitation.id,
  scope: invitation.scope,
  target_entity_id: invitation.targetEntityId,
  email: invitation.email,
  role: invitation.role,
  token_hash: invitation.tokenHash,
  status: invitation.status,
  invited_by: invitation.invitedBy,
  accepted_by: invitation.acceptedBy,
  accepted_at: invitation.acceptedAt,
  revoked_at: invitation.revokedAt,
  revoked_by: invitation.revokedBy,
  expires_at: invitation.expiresAt,
  metadata: invitation.metadata,
  created_at: invitation.createdAt,
  updated_at: invitation.updatedAt,
});

export function createSupabaseInvitationStore(
  client: ReturnType<typeof createSupabaseAdminClient> = createSupabaseAdminClient(),
): InvitationStore {
  return {
    async save(invitation) {
      const { error } = await client
        .from("platform_invitations")
        .upsert(toRow(invitation), { onConflict: "id" });
      if (error) {
        throw new Error(`platform_invitations.save: ${error.message}`);
      }
    },

    async getById(id) {
      const { data, error } = await client
        .from("platform_invitations")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) {
        throw new Error(`platform_invitations.getById: ${error.message}`);
      }
      return data ? mapRow(data as InvitationRow) : null;
    },

    async getByTokenHash(tokenHash) {
      const { data, error } = await client
        .from("platform_invitations")
        .select("*")
        .eq("token_hash", tokenHash)
        .maybeSingle();
      if (error) {
        throw new Error(`platform_invitations.getByTokenHash: ${error.message}`);
      }
      return data ? mapRow(data as InvitationRow) : null;
    },

    async listByTarget({ scope, targetEntityId, statuses }) {
      let query = client
        .from("platform_invitations")
        .select("*")
        .eq("scope", scope)
        .eq("target_entity_id", targetEntityId)
        .order("created_at", { ascending: false });

      if (statuses?.length) {
        query = query.in("status", statuses);
      }

      const { data, error } = await query;
      if (error) {
        throw new Error(`platform_invitations.listByTarget: ${error.message}`);
      }
      return (data as InvitationRow[] | null)?.map(mapRow) ?? [];
    },

    async update(invitation) {
      const row = toRow(invitation);
      const { error } = await client
        .from("platform_invitations")
        .update({
          status: row.status,
          token_hash: row.token_hash,
          accepted_by: row.accepted_by,
          accepted_at: row.accepted_at,
          revoked_at: row.revoked_at,
          revoked_by: row.revoked_by,
          expires_at: row.expires_at,
          metadata: row.metadata,
          updated_at: row.updated_at,
          role: row.role,
          email: row.email,
        })
        .eq("id", row.id);
      if (error) {
        throw new Error(`platform_invitations.update: ${error.message}`);
      }
    },
  };
}

export async function expireStalePlatformInvitations(
  client: ReturnType<typeof createSupabaseAdminClient> = createSupabaseAdminClient(),
): Promise<number> {
  const { data, error } = await client.rpc("expire_platform_invitations");
  if (error) {
    throw new Error(
      `expire_platform_invitations unavailable (Migration 050 required): ${error.message}`,
    );
  }
  return typeof data === "number" ? data : Number(data ?? 0);
}
