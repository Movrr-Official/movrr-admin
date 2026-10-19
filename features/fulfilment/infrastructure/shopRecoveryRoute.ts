import { NextResponse } from "next/server";
import { isAuthorizedInternalJobRequest } from "@/lib/internalJobAuth";
import { runShopRecovery } from "@/features/fulfilment/application/commands/runShopRecovery";

export async function shopRecoveryRoute(request: Request) {
  if (!await isAuthorizedInternalJobRequest(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const result = await runShopRecovery();
  return NextResponse.json({ success: true, ...result }, { headers: { "cache-control": "no-store" } });
}
