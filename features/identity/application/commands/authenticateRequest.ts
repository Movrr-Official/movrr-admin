import type {
  AuthenticateRequestDeps,
  AuthenticateRequestInput,
} from "@/features/identity/application/contracts/AuthenticateRequest";
import type {
  AuthenticatedPrincipal,
  RequestContext,
} from "@/features/identity/domain/Principal";
import {
  fail,
  ok,
  type ApplicationResult,
} from "@/lib/result/ApplicationResult";
import { getOrCreateCorrelationId } from "@/lib/http/correlationId";
import { isEmployeeRole, employeeHasCapability } from "@/features/organisations/domain/employeeRoleTemplates";
import { capabilitiesForRider } from "@/features/organisations/domain/CapabilityCatalog";

/**
 * Principal resolution priority (from DB records only; clients never declare type):
 * Owned Rider handlers select the active Rider profile first.
 * 1. AdminPrincipal if a canonical employee membership exists
 * 2. OrganisationPrincipal if organisation membership hit
 * 3. RiderPrincipal if rider profile hit
 * 4. Otherwise unrecognised_principal failure
 */
export async function authenticateRequest(
  input: AuthenticateRequestInput,
  deps: AuthenticateRequestDeps,
): Promise<ApplicationResult<RequestContext>> {
  const token = input.accessToken?.trim();
  if (!token) {
    return fail("unauthenticated", "Missing authorization token");
  }

  const verified = await deps.verifyAccessToken(token);
  if (!verified) {
    return fail("unauthenticated", "Invalid or expired token");
  }

  const { userId, email } = verified;
  const correlationId = getOrCreateCorrelationId(input.correlationIdHeader);

  if (input.organisationId && !input.preferRider) {
    const membership = await deps.findOrganisationMembership(userId, input.organisationId);
    if (!membership || membership.organisationId !== input.organisationId) {
      return fail("permission_denied", "Active membership in the selected organisation is required");
    }
    return ok(buildContext({ type: "organisation", userId, email,
      organisationId: membership.organisationId, membershipId: membership.id,
      role: membership.role, organisationType: membership.organisationType }, correlationId));
  }

  // A legitimate employee membership does not replace the same identity's Rider
  // profile. Owned-resource handlers use that profile and only Rider grants.
  if (input.preferRider) {
    const rider = await deps.findRiderProfile(userId);
    if (rider) return ok(buildContext({ type: "rider", userId, email, riderId: rider.id }, correlationId));
  }

  const admin = await deps.findAdminUser(userId);
  if (admin && isEmployeeRole(admin.role)) {
    // Shared read endpoints still enforce resource ownership for Rider contexts.
    // An unrelated employee role cannot remove existing self-service access.
    if (input.requiredCapability && !employeeHasCapability(admin.role,input.requiredCapability) &&
        capabilitiesForRider().some(capability => capability === input.requiredCapability)) {
      const rider=await deps.findRiderProfile(userId);
      if(rider) return ok(buildContext({type:"rider",userId,email,riderId:rider.id},correlationId));
    }
    return ok(
      buildContext(
        {
          type: "admin",
          userId,
          email,
          adminUserId: admin.id,
          role: admin.role,
        },
        correlationId,
      ),
    );
  }

  const membership = await deps.findOrganisationMembership(userId, input.organisationId);
  if (membership) {
    return ok(
      buildContext(
        {
          type: "organisation",
          userId,
          email,
          organisationId: membership.organisationId,
          membershipId: membership.id,
          role: membership.role,
          organisationType: membership.organisationType,
        },
        correlationId,
      ),
    );
  }

  const rider = await deps.findRiderProfile(userId);
  if (rider) {
    return ok(
      buildContext(
        {
          type: "rider",
          userId,
          email,
          riderId: rider.id,
        },
        correlationId,
      ),
    );
  }

  return fail(
    "unrecognised_principal",
    "Authenticated user has no recognised principal",
  );
}

function buildContext(
  principal: AuthenticatedPrincipal,
  correlationId: string,
): RequestContext {
  return {
    principal,
    correlationId,
    // Task 3 AuthorisationService fills capability bundles; keep empty for now.
    permissions: [],
    audit: {
      actorUserId: principal.userId,
      actorEmail: principal.email,
      principalType: principal.type,
    },
  };
}
