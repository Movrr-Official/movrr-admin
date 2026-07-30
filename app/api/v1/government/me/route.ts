import { platformRoute } from "@/lib/http/platformRoute";
import { productionAuthDeps } from "@/features/platform/infrastructure/productionPlatformApi";
import { getGovernmentProfile } from "@/features/government/application/governmentPlatformService";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return platformRoute({
    request,
    capability: "programmes.read",
    authDeps: productionAuthDeps,
    handle: (ctx) => getGovernmentProfile(ctx),
  });
}
