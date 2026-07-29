import type { RequestContext } from "@/features/identity/domain/Principal";
import type { ApplicationResult } from "@/lib/result/ApplicationResult";

export type VerifiedAccessToken = {
  userId: string;
  email: string | null;
};

export type AdminUserRecord = {
  id: string;
  userId: string;
  email: string | null;
  role: string;
};

export type RiderProfileRecord = {
  id: string;
  userId: string;
};

export type OrganisationMembershipRecord = {
  id: string;
  organisationId: string;
  userId: string;
  role?: string;
};

/** Verifies a Supabase access token; returns null when missing/invalid. */
export type VerifyAccessToken = (
  token: string,
) => Promise<VerifiedAccessToken | null>;

export type FindAdminUser = (
  userId: string,
) => Promise<AdminUserRecord | null>;

export type FindRiderProfile = (
  userId: string,
) => Promise<RiderProfileRecord | null>;

/**
 * Organisation membership lookup port.
 * Task 2 ships a stub adapter that returns null until Task 3 wires real tables.
 */
export type FindOrganisationMembership = (
  userId: string,
) => Promise<OrganisationMembershipRecord | null>;

export type AuthenticateRequestDeps = {
  verifyAccessToken: VerifyAccessToken;
  findAdminUser: FindAdminUser;
  findOrganisationMembership: FindOrganisationMembership;
  findRiderProfile: FindRiderProfile;
};

/**
 * Input for authentication. Clients send a bearer access token only —
 * never a principal type (resolution is derived from DB records).
 */
export type AuthenticateRequestInput = {
  accessToken: string | null | undefined;
  correlationIdHeader?: string | null;
};

export type AuthenticateRequest = (
  input: AuthenticateRequestInput,
  deps: AuthenticateRequestDeps,
) => Promise<ApplicationResult<RequestContext>>;
