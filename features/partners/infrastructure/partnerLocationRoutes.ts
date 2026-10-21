import "server-only";
import { platformRoute } from "@/lib/http/platformRoute";
import { productionAuthDeps } from "@/features/platform/infrastructure/productionPlatformApi";
import { createPartnerLocationService } from "@/features/partners/application/partnerLocationService";
import { createSupabasePartnerLocationPort } from "./supabasePartnerLocations";
import { fail } from "@/lib/result/ApplicationResult";
const service = createPartnerLocationService(createSupabasePartnerLocationPort());
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function discoveryRoute(request: Request) {
    const response = await platformRoute({
        request,
        authDeps: productionAuthDeps,
        capability: "rewards.catalog.read",
        preferRider: true,
        handle: async (ctx) => {
            try {
                return await service.discover(ctx, Object.fromEntries(new URL(request.url).searchParams));
            }
            catch {
                console.error("[PartnerLocations] discovery failed", { correlationId: ctx.correlationId });
                return fail("InfrastructureFailure", "Partner discovery unavailable");
            }
        },
    });
    // Private and short lived. Never publicly cache rider-authenticated responses.
    if (response.ok)
        response.headers.set("cache-control", "private, max-age=30");
    return response;
}
export function locationOperationsRoute(request: Request, organisationId: string) {
    return platformRoute<unknown>({
        request,
        authDeps: productionAuthDeps,
        capability: "rewards.manage",
        handle: async (ctx) => {
            if (!uuid.test(organisationId))
                return fail("validation", "Invalid organisation ID");
            try {
                return request.method === "GET"
                    ? await service.list(ctx, organisationId, Object.fromEntries(new URL(request.url).searchParams))
                    : await service.save(ctx, organisationId, await request.json());
            }
            catch (error) {
                console.error("[PartnerLocations] operation failed", { correlationId: ctx.correlationId, operation: request.method });
                if (error instanceof Error && /version conflict/.test(error.message))
                    return fail("ConcurrencyConflict", "Location changed. Reload before editing.");
                if (error instanceof SyntaxError)
                    return fail("validation", "Invalid JSON body");
                if (error instanceof Error && /not found/i.test(error.message))
                    return fail("not_found", "Partner or location not found");
                if (error instanceof Error && /Catalog item belongs|check constraint|invalid input syntax/i.test(error.message))
                    return fail("validation", "Invalid location or reward association");
                return fail("InfrastructureFailure", "Location operation unavailable");
            }
        },
    });
}
