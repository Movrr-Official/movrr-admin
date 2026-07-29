import { NextResponse } from "next/server";
import { isAuthorizedInternalJobRequest } from "@/lib/internalJobAuth";
import { expireFulfilments } from "@/features/fulfilment/application/commands/expireFulfilments";
import { getFulfilmentJobEngine } from "@/features/fulfilment/infrastructure/composeFulfilmentJobs";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: Request) {
  if (!isAuthorizedInternalJobRequest(request)) {
    return NextResponse.json(
      { success: false, error: "unauthorized" },
      { status: 401, headers: { "cache-control": "no-store" } },
    );
  }

  const result = await expireFulfilments({
    engine: getFulfilmentJobEngine(),
  });

  return NextResponse.json(
    { success: true, ...result },
    { headers: { "cache-control": "no-store" } },
  );
}
