import "server-only";

import { createClient } from "@supabase/supabase-js";
import {
  NEXT_PUBLIC_SUPABASE_ANON_KEY,
  NEXT_PUBLIC_SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
} from "@/lib/env";

export type RiderSessionAuthSuccess = {
  ok: true;
  userId: string;
  riderId: string;
};

export type RiderSessionAuthFailure = {
  ok: false;
  status: 401 | 403 | 404;
  error: string;
};

export type RiderSessionAuthResult =
  | RiderSessionAuthSuccess
  | RiderSessionAuthFailure;

const extractBearerToken = (request: Request): string | null => {
  const authHeader = request.headers.get("authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return null;
  }

  const token = authHeader.slice(7).trim();
  return token.length > 0 ? token : null;
};

/**
 * Validates the rider JWT and confirms the authenticated user owns the session.
 * Service role is used only for the ownership lookup after JWT verification.
 */
export async function authenticateRiderSessionRequest(
  request: Request,
  sessionId: string,
): Promise<RiderSessionAuthResult> {
  const token = extractBearerToken(request);
  if (!token) {
    return { ok: false, status: 401, error: "Missing authorization token" };
  }

  const authClient = createClient(
    NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      auth: { autoRefreshToken: false, persistSession: false },
    },
  );

  const {
    data: { user },
    error: authError,
  } = await authClient.auth.getUser(token);

  if (authError || !user) {
    return { ok: false, status: 401, error: "Invalid or expired token" };
  }

  const adminClient = createClient(
    NEXT_PUBLIC_SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: { autoRefreshToken: false, persistSession: false },
    },
  );

  const { data: session, error: sessionError } = await adminClient
    .from("ride_session")
    .select("id, rider_id")
    .eq("id", sessionId)
    .maybeSingle();

  if (sessionError || !session) {
    return { ok: false, status: 404, error: "Session not found" };
  }

  const { data: rider, error: riderError } = await adminClient
    .from("rider")
    .select("user_id")
    .eq("id", session.rider_id)
    .maybeSingle();

  if (riderError || !rider?.user_id || rider.user_id !== user.id) {
    return { ok: false, status: 403, error: "Session access denied" };
  }

  return { ok: true, userId: user.id, riderId: session.rider_id };
}
