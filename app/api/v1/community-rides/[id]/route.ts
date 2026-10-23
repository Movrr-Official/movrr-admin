import { COMMUNITY_CLIENT_CONTRACT } from "@/features/community/domain/clientContract";
import { createSupabaseRequestClient } from "@/lib/supabase-request";
import { platformRoute } from "@/lib/http/platformRoute";
import { productionAuthDeps } from "@/features/platform/infrastructure/productionPlatformApi";
import { updateCommunityRide } from "@/features/community/application/communityPlatformService";
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return platformRoute({ clientContract: COMMUNITY_CLIENT_CONTRACT,
    request,
    capability: "rewards.catalog.read",
    authDeps: productionAuthDeps,
    handle: async (ctx) =>
      updateCommunityRide(
        ctx,
        id,
        await request.json().catch(() => null),
        createSupabaseRequestClient(request),
      ),
  });
}
