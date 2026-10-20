import { getProductionPlatformApi } from "@/features/platform/infrastructure/productionPlatformApi";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const api = await getProductionPlatformApi();
  const response = await api.wallet.statement(request);
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  return response;
}
