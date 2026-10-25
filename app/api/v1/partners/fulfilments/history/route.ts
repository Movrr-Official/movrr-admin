import { getProductionPlatformApi } from "@/features/platform/infrastructure/productionPlatformApi";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  return (await getProductionPlatformApi()).partners.history(request);
}
