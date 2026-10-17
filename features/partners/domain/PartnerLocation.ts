import { z } from "zod";
export const BoundsSchema = z
    .object({
    south: z.coerce.number().finite().min(-90).max(90),
    north: z.coerce.number().finite().min(-90).max(90),
    west: z.coerce.number().finite().min(-180).max(180),
    east: z.coerce.number().finite().min(-180).max(180),
    cursor: z.string().uuid().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(100),
})
    .refine((b) => b.north > b.south &&
    b.east > b.west &&
    b.north - b.south <= 0.5 &&
    b.east - b.west <= 0.5, "Bounds must be ordered and span at most 0.5 degrees");
export type LocationBounds = z.infer<typeof BoundsSchema>;
export const LocationInputSchema = z
    .object({
    id: z.string().uuid().optional(),
    expectedUpdatedAt: z.string().datetime({ offset: true }).optional(),
    name: z.string().trim().min(1).max(120),
    address: z.string().trim().min(1).max(500),
    latitude: z.number().finite().min(-90).max(90).nullable(),
    longitude: z.number().finite().min(-180).max(180).nullable(),
    status: z.enum(["draft", "published", "suspended"]),
    coordinatesVerified: z.boolean(),
    rewardIds: z.array(z.string().uuid()).max(30).default([]),
})
    .refine((v) => (v.latitude === null) === (v.longitude === null), "Supply both coordinates")
    .refine((v) => v.status !== "published" ||
    (v.coordinatesVerified && v.latitude !== null), "Publication requires reviewed coordinates")
    .refine((v) => !v.id || Boolean(v.expectedUpdatedAt), "Editing requires the current version");
export type LocationInput = z.infer<typeof LocationInputSchema>;
export type PartnerLocation = {
    id: string;
    organisationId: string;
    partnerId: string;
    name: string;
    address: string;
    latitude: number | null;
    longitude: number | null;
    status: "draft" | "published" | "suspended";
    coordinatesVerified: boolean;
    rewardIds: string[];
    updatedAt: string;
};
export type PublicPartnerLocation = {
    id: string;
    organisationId: string;
    partnerId: string;
    partnerName: string;
    businessCategory?: string | null;
    logoUrl?: string | null;
    name: string;
    address: string;
    latitude: number;
    longitude: number;
    updatedAt: string;
    rewards: {
        id: string;
        title: string;
        pointsPrice: number;
    }[];
};
export const PageInputSchema = z.object({ cursor: z.string().uuid().optional(), limit: z.coerce.number().int().min(1).max(100).default(100) });
export type LocationPage<T> = {
    locations: T[];
    nextCursor: string | null;
    complete: boolean;
};
export const PublicLocationSchema = z.object({
    id: z.string().uuid(), organisationId: z.string().uuid(), partnerId: z.string().uuid(),
    businessCategory: z.string().nullable().optional(),
    partnerName: z.string().min(1), logoUrl: z.string().url().startsWith("https://").nullable().optional(),
    name: z.string().min(1), address: z.string().min(1),
    latitude: z.number().finite().min(-90).max(90), longitude: z.number().finite().min(-180).max(180),
    updatedAt: z.string().datetime({ offset: true }),
    rewards: z.array(z.object({ id: z.string().uuid(), title: z.string(), pointsPrice: z.number().nonnegative() })).max(30),
});
export function locationPage<T extends {
    id: string;
}>(rows: T[], limit: number): LocationPage<T> {
    const locations = rows.slice(0, limit);
    const complete = rows.length <= limit;
    return { locations, complete, nextCursor: complete ? null : locations[locations.length - 1].id };
}
export function publicLogoUrl(value: string | null): string | null {
    return z.string().url().startsWith("https://").safeParse(value).success ? value : null;
}
