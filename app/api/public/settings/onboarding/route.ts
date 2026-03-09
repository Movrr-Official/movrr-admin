import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  return NextResponse.json(
    { error: "Not found" },
    { status: 404, headers: { "cache-control": "no-store" } },
  );
}
