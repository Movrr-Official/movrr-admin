import "server-only";

import { createInvitationService } from "@/features/invitations/application/commands/invitationService";
import type { InvitationService } from "@/features/invitations/application/contracts/InvitationService";
import {
  createSupabaseInvitationStore,
  expireStalePlatformInvitations,
} from "@/features/invitations/infrastructure/supabaseInvitationStore";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

export function composeInvitationService(
  client: ReturnType<typeof createSupabaseAdminClient> = createSupabaseAdminClient(),
): InvitationService {
  const store = createSupabaseInvitationStore(client);
  return createInvitationService({
    store,
    expireStaleInStore: () => expireStalePlatformInvitations(client),
  });
}
