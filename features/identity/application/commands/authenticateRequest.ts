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

/**
 * Principal resolution priority (from DB records only; clients never declare type):
 * 1. AdminPrincipal if `admin_users` hit
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

  const admin = await deps.findAdminUser(userId);
  if (admin) {
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

  const membership = await deps.findOrganisationMembership(userId);
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
