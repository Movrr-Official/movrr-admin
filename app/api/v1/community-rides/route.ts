import { platformRoute } from "@/lib/http/platformRoute";
import { productionAuthDeps } from "@/features/platform/infrastructure/productionPlatformApi";
import {
  createCommunityRide,
  listCommunityRides,
} from "@/features/community/application/communityPlatformService";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return platformRoute({
    request,
    capability: "rewards.catalog.read",
    authDeps: productionAuthDeps,
    handle: (ctx) => listCommunityRides(ctx),
  });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  return platformRoute({
    request,
    capability: "rewards.catalog.read",
    authDeps: productionAuthDeps,
    handle: (ctx) =>
      createCommunityRide(ctx, {
        title: String(body.title ?? ""),
        description: typeof body.description === "string" ? body.description : undefined,
        scheduledAt: String(body.scheduledAt ?? ""),
        meetingPoint:
          typeof body.meetingPoint === "string" ? body.meetingPoint : undefined,
        category: typeof body.category === "string" ? body.category : undefined,
        maxParticipants:
          body.maxParticipants !== undefined ? Number(body.maxParticipants) : undefined,
      }),
  });
}
