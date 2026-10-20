import { createSupabaseRequestClient } from "@/lib/supabase-request";
import { platformRoute } from "@/lib/http/platformRoute";
import { productionAuthDeps } from "@/features/platform/infrastructure/productionPlatformApi";
import {
  joinCommunityRide,
} from "@/features/community/application/communityPlatformService";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;
  return platformRoute({
    request,
    capability: "rewards.catalog.read",
    authDeps: productionAuthDeps,
    handle: (ctx) => joinCommunityRide(ctx, id, createSupabaseRequestClient(request)),
  });
}
