/**
 * Realtime Publisher — Admin Live Map Feed
 *
 * Publishes rider position updates to the Supabase Realtime broadcast channel
 * `admin:rider_positions`. The admin live map subscribes to this channel
 * to display live rider states without polling.
 *
 * Payload is compliance-state-enriched: the mobile client's compliance claims
 * are NOT used — compliance_state is derived from backend-verified data.
 */

import { SupabaseClient } from "@supabase/supabase-js";
import type { AntiSpoofFlag } from "./complianceVerifier";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ComplianceState =
  | "compliant" // Inside zone or on corridor, speed valid
  | "marginal" // Near boundary (within 2× tolerance)
  | "non_compliant" // Outside zone/corridor for > 1 update
  | "paused" // Speed < 1 m/s for > 2 min
  | "signal_lost" // No update in > 60s (set by admin map, not here)
  | "under_review"; // Critical anti-spoof flag raised

export type RiderPositionPayload = {
  session_id: string;
  rider_id: string;
  lat: number;
  lon: number;
  speed_kmh: number;
  heading: number | null;
  compliance_state: ComplianceState;
  ride_type: string;
  campaign_id: string | null;
  current_zone_ids: string[];
  reward_preview: number | null;
  updated_at: string;
};

// ─── Compliance state derivation ──────────────────────────────────────────────

function deriveComplianceState(params: {
  speedKmh: number;
  rideType: string;
  currentZoneIds: string[];
  flags: AntiSpoofFlag[];
}): ComplianceState {
  const { speedKmh, rideType, currentZoneIds, flags } = params;

  if (flags.some((f) => f.severity === "critical")) return "under_review";

  // Paused: speed below walking threshold
  if (speedKmh < 1) return "paused";

  if (rideType === "ad_enhanced_ride") {
    // Boosted ride: compliance = currently inside at least one zone
    return currentZoneIds.length > 0 ? "compliant" : "non_compliant";
  }

  // Standard ride: always compliant at movement level (corridor bonus is separate)
  return "compliant";
}

// ─── Publisher ────────────────────────────────────────────────────────────────

/**
 * Publish a rider position update to the admin realtime channel.
 * Silently swallows errors — realtime failure must not block ingest.
 */
export async function publishRiderPositionUpdate(
  supabase: SupabaseClient,
  params: {
    sessionId: string;
    riderId: string;
    lat: number;
    lon: number;
    speedKmh: number;
    heading: number | null;
    rideType: string;
    campaignId: string | null;
    currentZoneIds: string[];
    flags: AntiSpoofFlag[];
    rewardPreview?: number | null;
  },
): Promise<void> {
  try {
    const complianceState = deriveComplianceState({
      speedKmh: params.speedKmh,
      rideType: params.rideType,
      currentZoneIds: params.currentZoneIds,
      flags: params.flags,
    });

    const payload: RiderPositionPayload = {
      session_id: params.sessionId,
      rider_id: params.riderId,
      lat: params.lat,
      lon: params.lon,
      speed_kmh: params.speedKmh,
      heading: params.heading,
      compliance_state: complianceState,
      ride_type: params.rideType,
      campaign_id: params.campaignId,
      current_zone_ids: params.currentZoneIds,
      reward_preview: params.rewardPreview ?? null,
      updated_at: new Date().toISOString(),
    };

    await supabase.channel("admin:rider_positions").send({
      type: "broadcast",
      event: "rider_position",
      payload,
    });
  } catch {
    // Intentionally swallowed — realtime is best-effort
  }
}
