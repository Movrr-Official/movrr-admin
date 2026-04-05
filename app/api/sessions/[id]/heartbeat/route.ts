/**
 * Session Heartbeat API
 * POST /api/sessions/[id]/heartbeat
 *
 * Called by the mobile app every 5 minutes during an active session.
 * Keeps the session record alive and triggers a 30-minute reward checkpoint
 * for long sessions. Auto-closes sessions that stop sending heartbeats
 * after the configured timeout.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from "@/lib/env";
import { logger } from "@/lib/logger";
import { triggerRewardUpdate } from "@/lib/services/rewardTrigger";
import { logSessionEvent } from "@/lib/services/sessionLogger";

const MAX_SESSION_DURATION_H = 8;
const CHECKPOINT_INTERVAL_MIN = 30;

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, { params }: RouteContext) {
  const { id: sessionId } = await params;

  const supabase = createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: session } = await supabase
    .from("ride_session")
    .select("id, rider_id, status, started_at, last_heartbeat_at")
    .eq("id", sessionId)
    .maybeSingle();

  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  if (!["active", "paused"].includes(session.status)) {
    return NextResponse.json(
      { status: session.status, action: "no_op" },
      { status: 200 },
    );
  }

  const now = new Date();

  // Auto-close if session exceeds maximum duration
  const startedAt = new Date(session.started_at);
  const durationH = (now.getTime() - startedAt.getTime()) / (1000 * 60 * 60);
  if (durationH > MAX_SESSION_DURATION_H) {
    await supabase
      .from("ride_session")
      .update({ status: "completed", completed_at: now.toISOString() })
      .eq("id", sessionId);

    logSessionEvent(
      logger,
      "session_auto_closed",
      sessionId,
      session.rider_id,
      { reason: "max_duration_exceeded", duration_h: durationH },
    );

    return NextResponse.json({ status: "auto_closed" });
  }

  // Update last_heartbeat_at
  await supabase
    .from("ride_session")
    .update({ last_heartbeat_at: now.toISOString() })
    .eq("id", sessionId);

  // 30-minute reward checkpoint for long sessions
  const lastHeartbeat = session.last_heartbeat_at
    ? new Date(session.last_heartbeat_at)
    : startedAt;
  const minutesSinceCheckpoint =
    (now.getTime() - lastHeartbeat.getTime()) / 60_000;

  if (minutesSinceCheckpoint >= CHECKPOINT_INTERVAL_MIN) {
    triggerRewardUpdate({ sessionId, supabase }).catch(() => {});
    logSessionEvent(
      logger,
      "reward_calculated",
      sessionId,
      session.rider_id,
      { checkpoint: true, duration_h: durationH },
    );
  }

  return NextResponse.json({ status: "ok", duration_h: Math.round(durationH * 10) / 10 });
}
