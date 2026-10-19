import { NextResponse } from "next/server";
import { isAuthorizedInternalJobRequest } from "@/lib/internalJobAuth";
import { runShopRecovery } from "@/features/fulfilment/application/commands/runShopRecovery";

export async function shopRecoveryRoute(request: Request) {
  if (!await isAuthorizedInternalJobRequest(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const result = await runShopRecovery();
  const success = result.failed === 0 && result.notificationFailures === 0;
  return NextResponse.json({ success, ...result }, { status: success ? 200 : 503, headers: { "cache-control": "no-store" } });
}
