import { platformRoute } from "@/lib/http/platformRoute";
import { productionAuthDeps } from "@/features/platform/infrastructure/productionPlatformApi";
import {
  joinCommunityRide,
  leaveCommunityRide,
} from "@/features/community/application/communityPlatformService";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const url = new URL(request.url);
  const action = url.searchParams.get("action") ?? "join";

  return platformRoute({
    request,
    capability: "rewards.catalog.read",
    authDeps: productionAuthDeps,
    handle: (ctx) =>
      action === "leave" ? leaveCommunityRide(ctx, id) : joinCommunityRide(ctx, id),
  });
}
