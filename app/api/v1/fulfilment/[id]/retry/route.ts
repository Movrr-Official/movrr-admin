import { getProductionPlatformApi } from "@/features/platform/infrastructure/productionPlatformApi";
export const dynamic = "force-dynamic";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return (await getProductionPlatformApi()).fulfilment.retry(request, { id });
}
