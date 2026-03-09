import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { logger } from "@/lib/logger";
import { writeUserActivity } from "@/lib/userActivity";

const supabase = createSupabaseAdminClient();
const accessLogSchema = z.object({
  action: z.string().min(1),
  ip_address: z.string().min(1).optional(),
  user_agent: z.string().min(1).optional(),
  success: z.boolean(),
});

export async function POST(request: Request) {
  try {
    const admin = await requireAdmin();
    const ip = getClientIp(request);
    const rateLimit = checkRateLimit(
      `log-admin-access:${admin.authUser.id}:${ip}`,
      { max: 120, windowMs: 60_000 },
    );
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { success: false, error: "rate_limited" },
        {
          status: 429,
          headers: {
            "retry-after": String(rateLimit.retryAfterSeconds),
            "x-ratelimit-remaining": String(rateLimit.remaining),
          },
        },
      );
    }

    const rawData = await request.json();
    const data = accessLogSchema.parse(rawData);
    await supabase.from("admin_access_logs").insert({
      ...data,
      user_id: admin.authUser.id,
      email: admin.adminUser.email,
    });
    await writeUserActivity(supabase, {
      user_id: admin.authUser.id,
      actor_user_id: admin.authUser.id,
      source: "admin_access",
      action: "Admin dashboard access",
      description: data.action,
      related_entity_type: "admin_access",
      related_entity_id: admin.authUser.id,
      metadata: {
        success: data.success,
        ip_address: data.ip_address ?? ip,
        user_agent: data.user_agent ?? null,
      },
    }).catch((activityError) => {
      logger.warn("User activity write failed during admin access logging", {
        error: activityError instanceof Error ? activityError.message : String(activityError),
      });
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Authentication required") {
      return NextResponse.json({ success: false, error: "unauthorized" }, { status: 401 });
    }
    logger.error("Admin access log insert failed", error);
    return NextResponse.json({ success: false, error: String(error) }, { status: 400 });
  }
}
