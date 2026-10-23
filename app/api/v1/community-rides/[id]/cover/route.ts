import { z } from "zod";
import { platformRoute, applicationResultToHttpStatus } from "@/lib/http/platformRoute";
import { productionAuthDeps } from "@/features/platform/infrastructure/productionPlatformApi";
import { createSupabaseRequestClient } from "@/lib/supabase-request";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { requireCapability } from "@/lib/admin";
import { coverHeaders, coverResponse, readCommunityCover } from "@/features/community/application/communityCover";
import { fail, ok } from "@/lib/result/ApplicationResult";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const path = new URL(request.url).searchParams.get("staged");
    if (!z.string().uuid().safeParse(id).success || !path) return new Response(null, { status: 404, headers: coverHeaders });
    return await platformRoute({ request, capability: "rewards.catalog.read", authDeps: productionAuthDeps, preferRider: true,
      handle: async ctx => {
        const allowed = await createSupabaseRequestClient(request).rpc("community_cover_orphan_authorized", { p_ride: id, p_path: path });
        if (allowed.error || allowed.data !== true) return fail("permission_denied", "Cover unavailable");
        // Database evidence/reference triggers still recheck at Storage deletion.
        const removed = await createSupabaseAdminClient(async () => ctx.principal.userId).storage.from("community-rides").remove([path]);
        return removed.error ? fail("unavailable", "Cover unavailable") : ok(null);
      } });
  } catch { return new Response(null, { status: 403, headers: coverHeaders }); }
}
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!z.string().uuid().safeParse(id).success) return new Response(null, { status: 404, headers: coverHeaders });
    const query = new URL(request.url).searchParams;
    if (request.headers.has("authorization")) {
      if (query.has("report")) return new Response(null, { status: 403, headers: coverHeaders });
      const response = await platformRoute({ request, capability: "rewards.catalog.read", authDeps: productionAuthDeps,
        preferRider: true,
        handle: ctx => readCommunityCover(createSupabaseRequestClient(request), createSupabaseAdminClient(), id,
          { userId: ctx.principal.userId, staged: query.get("staged") ?? undefined }),
        respond: coverResponse });
      for (const [key, value] of Object.entries(coverHeaders)) response.headers.set(key, value);
      return response;
    }
    // Dashboard cookies use their existing active/MFA capability authority.
    // A failed bearer request is never retried through dashboard credentials.
    await requireCapability("community.manage");
    const report = query.get("report") ?? undefined;
    if (report && !z.string().uuid().safeParse(report).success) return new Response(null, { status: 404, headers: coverHeaders });
    const db = createSupabaseAdminClient();
    const result = await readCommunityCover(db, db, id, { staff: true, report });
    return result.ok ? coverResponse(result.value) : new Response(null, { status: applicationResultToHttpStatus(result.kind), headers: coverHeaders });
  } catch { return new Response(null, { status: 403, headers: coverHeaders }); }
}
