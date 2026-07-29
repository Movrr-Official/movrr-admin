import { getProductionPlatformApi } from "@/features/platform/infrastructure/productionPlatformApi";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const api = await getProductionPlatformApi();
  return api.organisations.list(request);
}

export async function POST(request: Request) {
  const api = await getProductionPlatformApi();
  return api.organisations.create(request);
}
