import { getProductionPlatformApi } from "@/features/platform/infrastructure/productionPlatformApi";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const api = await getProductionPlatformApi();
  return api.wallet.balance(request);
}
