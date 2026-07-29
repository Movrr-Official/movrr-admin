/**
 * Authenticated principals resolved by Identity from DB records only.
 * Clients never declare principal type.
 */
export type Capability = string;

export type AdminPrincipal = {
  type: "admin";
  userId: string;
  email: string | null;
  adminUserId: string;
  role: string;
};

export type OrganisationPrincipal = {
  type: "organisation";
  userId: string;
  email: string | null;
  organisationId: string;
  membershipId: string;
  role?: string;
};

export type RiderPrincipal = {
  type: "rider";
  userId: string;
  email: string | null;
  riderId: string;
};

export type AuthenticatedPrincipal =
  | AdminPrincipal
  | OrganisationPrincipal
  | RiderPrincipal;

export type AuditContext = {
  actorUserId: string;
  actorEmail: string | null;
  principalType: AuthenticatedPrincipal["type"];
};

/**
 * Per-request identity + authz skeleton.
 * `permissions` stays empty in Task 2 until AuthorisationService (Task 3) loads bundles.
 */
export type RequestContext = {
  principal: AuthenticatedPrincipal;
  correlationId: string;
  permissions: Capability[];
  audit: AuditContext;
};
