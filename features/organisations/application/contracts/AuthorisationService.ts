import type {
  AuthenticatedPrincipal,
  Capability,
  RequestContext,
} from "@/features/identity/domain/Principal";
import type { ApplicationResult } from "@/lib/result/ApplicationResult";

/**
 * Capability AuthZ over RequestContext.
 * Default-deny: missing / unknown capability ⇒ permission_denied.
 */
export type ResolvePermissions = (
  principal: AuthenticatedPrincipal,
) => Capability[];

export type AssertCapability = (
  ctx: RequestContext,
  capability: Capability,
) => ApplicationResult<void>;

export type WithPermissions = (ctx: RequestContext) => RequestContext;

export type AuthorisationService = {
  resolvePermissions: ResolvePermissions;
  assertCapability: AssertCapability;
  withPermissions: WithPermissions;
};
