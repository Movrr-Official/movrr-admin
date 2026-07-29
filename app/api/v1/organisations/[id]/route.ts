import { getProductionPlatformApi } from "@/features/platform/infrastructure/productionPlatformApi";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Ctx) {
  const { id } = await context.params;
  const api = await getProductionPlatformApi();
  return api.organisations.get(request, { id });
}

export async function PATCH(request: Request, context: Ctx) {
  const { id } = await context.params;
  const api = await getProductionPlatformApi();
  return api.organisations.update(request, { id });
}
