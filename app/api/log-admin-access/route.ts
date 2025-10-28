import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: Request) {
  try {
    const data = await request.json();
    await supabase.from("admin_access_logs").insert(data);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Log insert failed:", error);
    return NextResponse.json({ success: false, error: String(error) });
  }
}
