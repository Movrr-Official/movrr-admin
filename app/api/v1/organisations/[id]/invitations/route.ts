import { createHash } from "node:crypto";
import { z } from "zod";
import { platformRoute } from "@/lib/http/platformRoute";
import { productionAuthDeps } from "@/features/platform/infrastructure/productionPlatformApi";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { CUSTOMER_APP_URL } from "@/lib/env";
import { MEMBERSHIP_ROLES } from "@/features/identity/domain/accountDomains";
import { fail, ok } from "@/lib/result/ApplicationResult";
const schema = z.object({ userId: z.string().uuid(), role: z.enum(MEMBERSHIP_ROLES),
  operationToken: z.string().regex(/^[a-f0-9]{64}$/), expectedUpdatedAt: z.string().datetime({ offset: true }).nullable().optional() }).strict();
export const dynamic = "force-dynamic";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return platformRoute({ request, capability: "staff.manage", authDeps: productionAuthDeps, handle: async ctx => {
    if (ctx.principal.type !== "admin" && (ctx.principal.type !== "organisation" || ctx.principal.organisationId !== id)) return fail("permission_denied", "Organisation scope mismatch");
    const input = schema.safeParse(await request.json().catch(() => null));
    if (!input.success) return fail("validation", "Valid invited identity, role and retry token required");
    const { data, error } = await createSupabaseAdminClient().rpc("issue_organisation_invitation", {
      p_actor: ctx.principal.userId, p_user: input.data.userId, p_organisation: id, p_role: input.data.role,
      p_token_hash: createHash("sha256").update(input.data.operationToken).digest("hex"), p_expected: input.data.expectedUpdatedAt ?? null,
    });
    if (error) return fail(error.code === "42501" ? "permission_denied" : "validation", error.message);
    const url = new URL("/auth/accept-organisation-invitation", CUSTOMER_APP_URL); url.searchParams.set("token", input.data.operationToken);
    return ok({ invitationId: data.id as string, url: url.toString() });
  } });
}
