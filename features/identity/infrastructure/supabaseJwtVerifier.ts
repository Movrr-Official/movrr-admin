import "server-only";

import { createClient } from "@supabase/supabase-js";
import {
  NEXT_PUBLIC_SUPABASE_ANON_KEY,
  NEXT_PUBLIC_SUPABASE_URL,
} from "@/lib/env";
import type {
  FindOrganisationMembership,
  VerifiedAccessToken,
  VerifyAccessToken,
} from "@/features/identity/application/contracts/AuthenticateRequest";

/**
 * Verifies a Supabase access token via auth.getUser(token).
 * Mirrors the JWT pattern in `lib/riderSessionAuth.ts`.
 */
export const verifySupabaseAccessToken: VerifyAccessToken = async (
  token: string,
): Promise<VerifiedAccessToken | null> => {
  const authClient = createClient(
    NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      auth: { autoRefreshToken: false, persistSession: false },
    },
  );

  const {
    data: { user },
    error,
  } = await authClient.auth.getUser(token);

  if (error || !user) {
    return null;
  }

  return {
    userId: user.id,
    email: user.email ?? null,
  };
};

/**
 * Stub until Task 3 wires organisation membership tables.
 * Always returns null so resolution falls through to rider / unrecognised.
 */
export const findOrganisationMembershipStub: FindOrganisationMembership =
  async () => null;
