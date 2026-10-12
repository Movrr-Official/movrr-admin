import { fail, ok } from "@/lib/result/ApplicationResult";
import type { RequestContext } from "@/features/identity/domain/Principal";
import { BoundsSchema, PageInputSchema, locationPage, LocationInputSchema, type LocationBounds, type LocationInput, type PartnerLocation, type PublicPartnerLocation, } from "@/features/partners/domain/PartnerLocation";
export type PartnerLocationPort = {
    discover: (bounds: LocationBounds) => Promise<PublicPartnerLocation[]>;
    list: (organisationId: string, page?: {
        cursor?: string;
        limit: number;
    }) => Promise<PartnerLocation[]>;
    save: (organisationId: string, input: LocationInput, actor: string, correlationId: string) => Promise<PartnerLocation>;
    hit: (userId: string) => Promise<boolean>;
};
/** Physical operations extend the existing Organisation identity. Admin publication is explicit. */
export function createPartnerLocationService(port: PartnerLocationPort) {
    return {
        async discover(ctx: RequestContext, input: unknown) {
            if (!ctx.permissions.includes("rewards.catalog.read") ||
                (ctx.principal.type !== "rider" && ctx.principal.type !== "admin"))
                return fail("permission_denied", "Rider discovery only");
            const parsed = BoundsSchema.safeParse(input);
            if (!parsed.success)
                return fail("validation", parsed.error.issues[0].message);
            if (!(await port.hit(ctx.principal.userId)))
                return fail("rate_limited", "Discovery rate limit exceeded");
            return ok({
                ...locationPage(await port.discover(parsed.data), parsed.data.limit),
                fetchedAt: new Date().toISOString(),
            });
        },
        async list(ctx: RequestContext, organisationId: string, input: unknown = {}) {
            if (ctx.principal.type !== "admin" ||
                !ctx.permissions.includes("rewards.manage"))
                return fail("permission_denied", "Admin operations required");
            const parsed = PageInputSchema.safeParse(input);
            if (!parsed.success)
                return fail("validation", "Invalid pagination");
            return ok(locationPage(await port.list(organisationId, parsed.data), parsed.data.limit));
        },
        async save(ctx: RequestContext, organisationId: string, input: unknown) {
            if (ctx.principal.type !== "admin" ||
                !ctx.permissions.includes("rewards.manage"))
                return fail("permission_denied", "Admin operations required");
            const parsed = LocationInputSchema.safeParse(input);
            if (!parsed.success)
                return fail("validation", parsed.error.issues[0].message);
            return ok(await port.save(organisationId, parsed.data, ctx.principal.userId, ctx.correlationId));
        },
    };
}
