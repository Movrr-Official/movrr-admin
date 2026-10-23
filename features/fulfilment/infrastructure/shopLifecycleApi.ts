import "server-only";
import type { AuthenticateRequestDeps } from "@/features/identity/application/contracts/AuthenticateRequest";
import type { PlatformApiHandlers } from "@/features/platform/infrastructure/composePlatformApi";
import { platformRoute } from "@/lib/http/platformRoute";
import { isRiderOwnedApiPath } from "@/lib/pathMatch";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { fail, ok } from "@/lib/result/ApplicationResult";
import { createSupabaseRateLimitStore } from "@/features/fraud/infrastructure/supabaseRateLimitStore";
import { z } from "zod";

const uuid = z.string().uuid();
const operation = z.string().trim().min(1).max(200);
const checkout = z.object({ catalogItemId: uuid, expectedPointsPrice: z.number().int().nonnegative() }).strict();
const action = z.object({ reason: z.string().trim().min(1).max(1000), expectedVersion: z.number().int().nonnegative(), riderReason:z.string().trim().min(1).max(1000).optional() });
const scan = z.object({ token: z.string().min(32).max(512), fulfilmentId: uuid.optional(), expectedVersion: z.number().int().nonnegative().optional() });

export async function shopRpc(name: string, args: Record<string, unknown>) {
  const { data, error } = await createSupabaseAdminClient().rpc(name, args);
  if (error) {
    const kind = error.code === "42501" ? "permission_denied"
      : error.code === "40001" ? "ConcurrencyConflict"
      : error.code === "P0002" ? "not_found"
      : error.code === "55000" ? "unavailable"
      : error.code === "22023" ? "BusinessFailure" : "InfrastructureFailure";
    return fail(kind, kind === "InfrastructureFailure" ? "Reward service unavailable. Retry the same operation." : error.message);
  }
  return ok(data);
}

/** Boundary adapter only: all durable lifecycle effects execute in PostgreSQL. */
export function attachShopLifecycle(api: PlatformApiHandlers, authDeps: AuthenticateRequestDeps): PlatformApiHandlers {
  const route = (request: Request, capability: string, handle: Parameters<typeof platformRoute>[0]["handle"]) =>
    platformRoute({ request, capability, authDeps, handle,
      preferRider: isRiderOwnedApiPath(new URL(request.url).pathname) });
  const mutate = (request: Request, id: string | null, command: "cancel" | "refund" | "collect" | "consume" | "retry") =>
    route(request, `fulfilment.${command === "collect" ? "confirm" : command === "consume" ? "validate" : command === "retry" ? "cancel" : command}`, async (ctx, req) => {
      const key = operation.safeParse(req.headers.get("Idempotency-Key"));
      const body = await req.json().catch(() => null);
      const parsed = command === "consume" ? scan.safeParse(body) : action.safeParse(body);
      if (!key.success || !parsed.success || (id !== null && !uuid.safeParse(id).success)) return fail("validation", "Operation, target and current version are required");
      const limiter = createSupabaseRateLimitStore({ max: 60, windowMs: 60_000, requireAtomic: true });
      if (!await limiter.hit(`shop.command:${ctx.principal.userId}`)) return fail("rate_limited", "Please retry shortly using the same operation");
      const riderReason = "riderReason" in parsed.data ? parsed.data.riderReason : undefined;
      return shopRpc(riderReason ? "shop_fulfilment_command_with_feedback" : "shop_fulfilment_command", {
        p_actor: ctx.principal.userId, p_id: id ?? ("fulfilmentId" in parsed.data ? parsed.data.fulfilmentId : null), p_action: command,
        p_version: parsed.data.expectedVersion ?? null, p_operation: key.data,
        p_reason: "reason" in parsed.data ? parsed.data.reason : "partner_validation",
        p_correlation: ctx.correlationId, p_token: "token" in parsed.data ? parsed.data.token : null,
        ...(riderReason ? {p_rider_reason:riderReason} : {}),
      });
    });
  return {
    ...api,
    rewards: {
      ...api.rewards,
      catalog: request => route(request, "rewards.catalog.read", ctx => shopRpc("shop_catalog", { p_actor: ctx.principal.userId })),
      catalogById: (request, { id }) => route(request, "rewards.catalog.read", async ctx => {
        const result = await shopRpc("shop_catalog", { p_actor: ctx.principal.userId });
        if (!result.ok) return result;
        const row = (result.value as Array<{ id: string }>).find(item => item.id === id);
        return row ? ok(row) : fail("not_found", "Reward unavailable");
      }),
      redeem: request => route(request, "rewards.redeem", async (ctx, req) => {
        if (ctx.principal.type !== "rider") return fail("permission_denied", "Rider required");
        const key = operation.safeParse(req.headers.get("Idempotency-Key"));
        const body = checkout.safeParse(await req.json().catch(() => null));
        if (!key.success || !body.success) return fail("validation", "Reward, confirmed price and operation are required");
        const limiter = createSupabaseRateLimitStore({ max: 30, windowMs: 60_000, requireAtomic: true });
        if (!await limiter.hit(`shop.redeem:${ctx.principal.riderId}`)) return fail("rate_limited", "Please retry shortly using the same operation");
        const result = await shopRpc("shop_redeem", { p_actor: ctx.principal.userId,
          p_catalog: body.data.catalogItemId, p_expected_price: body.data.expectedPointsPrice,
          p_operation: key.data, p_correlation: ctx.correlationId });
        if (!result.ok) return result;
        const value = result.value as { redemption: unknown; fulfilment: { id: string; state: string; outcome: string | null } };
        return ok(value);
      }),
    },
    fulfilment: {
      ...api.fulfilment,
      token: (request, { id }) => route(request, "fulfilment.read", async ctx => {
        if (!uuid.safeParse(id).success) return fail("validation", "Invalid reward identifier");
        const result = await shopRpc("shop_get_credential", { p_actor: ctx.principal.userId, p_id: id });
        return result.ok && !result.value ? fail("not_found", "No usable credential available") : result;
      }),
      cancel: (request, { id }) => mutate(request, id, "cancel"),
      refund: (request, { id }) => mutate(request, id, "refund"),
      confirmCollection: (request, { id }) => mutate(request, id, "collect"),
      consumeToken: request => mutate(request, null, "consume"),
      retry: (request, { id }) => mutate(request, id, "retry"),
    },
    partners: {
      ...api.partners,
      resources: request => request.method === "POST" ? route(request, "resources.manage", async (ctx, req) => {
        const key = operation.safeParse(req.headers.get("Idempotency-Key"));
        const body = z.object({ resourceId: uuid, codes: z.array(z.string().trim().min(1).max(2000)).min(1).max(1000), expiresAt: z.string().datetime().optional(), partnerOrgId: uuid.optional() }).safeParse(await req.json().catch(() => null));
        if (!key.success || !body.success) return fail("validation", "Voucher pool, codes and operation required");
        return shopRpc("shop_import_codes", { p_actor: ctx.principal.userId, p_resource: body.data.resourceId,
          p_codes: body.data.codes, p_operation: key.data, p_correlation: ctx.correlationId, p_expires_at: body.data.expiresAt ?? null,
          p_partner_org: ctx.principal.type === "organisation" ? ctx.principal.organisationId : body.data.partnerOrgId ?? null });
      }) : api.partners.resources(request),
      validate: request => mutate(request, null, "consume"),
      confirmCollection: async request => {
        const body = await request.clone().json().catch(() => null);
        return mutate(request, body?.fulfilmentId ?? "", "collect");
      },
    },
  };
}
