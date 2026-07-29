import "server-only";

import { verifySupabaseAccessToken } from "@/features/identity/infrastructure/supabaseJwtVerifier";
import type { AuthenticateRequestDeps } from "@/features/identity/application/contracts/AuthenticateRequest";
import {
  createPlatformApiForTests,
  type PlatformApiHandlers,
} from "@/features/platform/infrastructure/composePlatformApi";

/**
 * Production AuthN ports. Membership / admin / rider lookups remain stubbed
 * until SQL adapters are wired; JWT verification is live.
 */
const productionAuthDeps: AuthenticateRequestDeps = {
  verifyAccessToken: verifySupabaseAccessToken,
  findAdminUser: async () => null,
  findOrganisationMembership: async () => null,
  findRiderProfile: async () => null,
};

let cached: Promise<PlatformApiHandlers> | null = null;

/** Lazy singleton Platform API handlers for Next.js route modules. */
export function getProductionPlatformApi(): Promise<PlatformApiHandlers> {
  if (!cached) {
    cached = createPlatformApiForTests({ authDeps: productionAuthDeps });
  }
  return cached;
}
