import { z } from "zod";
import { createSupabaseRequestClient } from "@/lib/supabase-request";
import { platformRoute } from "@/lib/http/platformRoute";
import { productionAuthDeps } from "@/features/platform/infrastructure/productionPlatformApi";
import { fail, ok } from "@/lib/result/ApplicationResult";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return platformRoute({
    request,
    capability: "rewards.catalog.read",
    authDeps: productionAuthDeps,
    handle: async (ctx) => {
      if (ctx.principal.type !== "rider")
        return fail("permission_denied", "Rider required");
      const p = z
        .object({ expectedUpdatedAt: z.string().datetime({ offset: true }) })
        .safeParse(await request.json().catch(() => null));
      if (!z.string().uuid().safeParse(id).success || !p.success)
        return fail("validation", "Current ride version required");
      const { data, error } = await createSupabaseRequestClient(request).rpc(
        "cancel_my_community_ride",
        { p_id: id, p_expected: p.data.expectedUpdatedAt },
      );
      return error
        ? fail(
            error.code === "40001" ? "ConcurrencyConflict" : "permission_denied",
            "Ride cancellation unavailable. Refresh its status.",
          )
        : ok(data);
    },
  });
}
