import type {
  AuthenticatedPrincipal,
  Capability,
  RequestContext,
} from "@/features/identity/domain/Principal";
import {
  fail,
  ok,
  type ApplicationResult,
} from "@/lib/result/ApplicationResult";
import {
  capabilitiesForOrgRole,
  capabilitiesForRider,
  capabilitiesForAdvertiser,
  capabilitiesForGovernment,
  isMembershipRole,
} from "@/features/organisations/domain/CapabilityCatalog";
import { mapAdminRoleToCapabilities } from "@/features/organisations/application/adminCapabilityMapper";
import type { AuthorisationService } from "@/features/organisations/application/contracts/AuthorisationService";

/**
 * Resolve capability grants for a principal (bundles / admin mapper / rider bundle).
 * Organisation roles map through permission bundles — never embed grants on the role enum alone.
 */
export function resolvePermissions(
  principal: AuthenticatedPrincipal,
): Capability[] {
  switch (principal.type) {
    case "admin":
      return mapAdminRoleToCapabilities(principal.role);
    case "organisation": {
      if (principal.organisationType === "advertiser") {
        return capabilitiesForAdvertiser();
      }
      if (principal.organisationType === "government") {
        return capabilitiesForGovernment();
      }
      if (!isMembershipRole(principal.role)) return [];
      return capabilitiesForOrgRole(principal.role);
    }
    case "rider":
      return capabilitiesForRider();
    default:
      return [];
  }
}

/**
 * Default-deny capability guard.
 * Only capabilities present on RequestContext.permissions are allowed.
 */
export function assertCapability(
  ctx: RequestContext,
  capability: Capability,
): ApplicationResult<void> {
  if (!capability || !ctx.permissions.includes(capability)) {
    return fail(
      "permission_denied",
      `Missing capability: ${capability || "(empty)"}`,
    );
  }
  return ok(undefined);
}

/** Attach resolved capability grants onto a RequestContext. */
export function withPermissions(ctx: RequestContext): RequestContext {
  return {
    ...ctx,
    permissions: resolvePermissions(ctx.principal),
  };
}

export const authorisationService: AuthorisationService = {
  resolvePermissions,
  assertCapability,
  withPermissions,
};
