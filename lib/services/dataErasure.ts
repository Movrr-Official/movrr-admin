import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { logger } from "@/lib/logger";

export type RiderErasureResult = {
  success: true;
  data: {
    riderId: string;
    gpsDeleted: number;
    sessionsAnonymized: number;
  };
};

/**
 * Execute GDPR-style rider erasure via privileged RPC.
 * Invoked only from admin server actions after role checks.
 */
export async function executeRiderDataErasure(params: {
  riderId: string;
  requestedByAdminId: string;
}): Promise<RiderErasureResult> {
  const supabaseAdmin = createSupabaseAdminClient();

  const { data, error } = await supabaseAdmin.rpc("erase_rider_personal_data", {
    p_rider_id: params.riderId,
    p_requested_by: params.requestedByAdminId,
  });

  if (error) {
    logger.error("Rider data erasure RPC failed", error, {
      riderId: params.riderId,
    });
    throw new Error(error.message);
  }

  const payload = (data ?? {}) as {
    gps_deleted?: number;
    sessions_anonymized?: number;
  };

  return {
    success: true,
    data: {
      riderId: params.riderId,
      gpsDeleted: payload.gps_deleted ?? 0,
      sessionsAnonymized: payload.sessions_anonymized ?? 0,
    },
  };
}
