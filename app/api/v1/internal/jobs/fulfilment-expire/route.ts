import { NextResponse } from "next/server";
import { isAuthorizedInternalJobRequest } from "@/lib/internalJobAuth";
import { expireFulfilments } from "@/features/fulfilment/application/commands/expireFulfilments";
import { getFulfilmentJobModule } from "@/features/fulfilment/infrastructure/composeFulfilmentJobs";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: Request) {
  if (!isAuthorizedInternalJobRequest(request)) {
    return NextResponse.json(
      { success: false, error: "unauthorized" },
      { status: 401, headers: { "cache-control": "no-store" } },
    );
  }

  const module = getFulfilmentJobModule();
  try {
    const result = await expireFulfilments({
      engine: module.engine,
    });
    module.metrics.recordJobRun({ job: "expire", expired: result.expired });
    await module.bus.flushAfterCommit();
    return NextResponse.json(
      { success: true, ...result },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    module.metrics.recordJobFailure({
      job: "expire",
      error: error instanceof Error ? error.message : "unknown",
    });
    throw error;
  }
}
