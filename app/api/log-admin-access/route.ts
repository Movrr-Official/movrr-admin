import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { logger } from "@/lib/logger";

const supabase = createSupabaseAdminClient();

export async function POST(request: Request) {
  try {
    const data = await request.json();
    await supabase.from("admin_access_logs").insert(data);
    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("Admin access log insert failed", error);
    return NextResponse.json({ success: false, error: String(error) });
  }
}
