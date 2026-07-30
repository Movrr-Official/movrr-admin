import "server-only";

import { verifySupabaseAccessToken } from "@/features/identity/infrastructure/supabaseJwtVerifier";
import { findAdminUser } from "@/features/identity/infrastructure/supabaseAdminUserLookup";
import { findRiderProfile } from "@/features/identity/infrastructure/supabaseRiderProfileLookup";
import { findOrganisationMembership } from "@/features/organisations/infrastructure/supabaseOrganisationMembershipLookup";
import { createSupabaseOrganisationOpsStore } from "@/features/organisations/infrastructure/supabaseOrganisationOpsStore";
import type { AuthenticateRequestDeps } from "@/features/identity/application/contracts/AuthenticateRequest";
import {
  createPlatformApiForTests,
  type PlatformApiHandlers,
} from "@/features/platform/infrastructure/composePlatformApi";
import { getSharedFulfilmentModule } from "@/features/fulfilment/infrastructure/composeFulfilmentModule";

/**
 * Production AuthN ports — JWT verify + real Supabase principal lookups
 * (admin_users, organisation_membership, rider).
 */
export const productionAuthDeps: AuthenticateRequestDeps = {
  verifyAccessToken: verifySupabaseAccessToken,
  findAdminUser,
  findOrganisationMembership,
  findRiderProfile,
};

let cached: Promise<PlatformApiHandlers> | null = null;

/** Lazy singleton Platform API handlers for Next.js route modules. */
export function getProductionPlatformApi(): Promise<PlatformApiHandlers> {
  if (!cached) {
    const fulfilmentModule = getSharedFulfilmentModule();
    cached = createPlatformApiForTests({
      authDeps: productionAuthDeps,
      fulfilmentModule,
      organisationStore: createSupabaseOrganisationOpsStore(),
    });
  }
  return cached;
}
