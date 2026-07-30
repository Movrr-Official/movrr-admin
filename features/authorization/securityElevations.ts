/**
 * Temporary access / break-glass / delegation frameworks (Phase 10 foundations).
 * Persisted elevation is intentionally deferred; this module defines the contract
 * and in-memory audit hooks so modules can integrate without redesign.
 */

import type { KnownCapability } from "@/features/organisations/domain/CapabilityCatalog";
import type { CanonicalEmployeeRole } from "@/features/organisations/domain/employeeRoleTemplates";

export type TemporaryAccessGrant = {
  id: string;
  granteeUserId: string;
  grantedByUserId: string;
  capabilities: KnownCapability[];
  reason: string;
  startsAt: string;
  expiresAt: string;
  revokedAt?: string | null;
};

export type BreakGlassEvent = {
  id: string;
  actorUserId: string;
  reason: string;
  targetRole?: CanonicalEmployeeRole;
  capabilities: KnownCapability[];
  openedAt: string;
  closedAt?: string | null;
  correlationId: string;
};

export type DelegationGrant = {
  id: string;
  delegatorUserId: string;
  delegateUserId: string;
  capabilities: KnownCapability[];
  reason: string;
  startsAt: string;
  expiresAt: string;
  revokedAt?: string | null;
};

/** In-memory stores for Phase 10 scaffolding (replace with persistence later). */
const temporaryGrants: TemporaryAccessGrant[] = [];
const breakGlassEvents: BreakGlassEvent[] = [];
const delegationGrants: DelegationGrant[] = [];

export function listActiveTemporaryGrants(
  userId: string,
  now = new Date(),
): TemporaryAccessGrant[] {
  const ts = now.toISOString();
  return temporaryGrants.filter(
    (g) =>
      g.granteeUserId === userId &&
      !g.revokedAt &&
      g.startsAt <= ts &&
      g.expiresAt >= ts,
  );
}

export function mergeTemporaryCapabilities(
  base: readonly KnownCapability[],
  userId: string,
): KnownCapability[] {
  const extra = listActiveTemporaryGrants(userId).flatMap((g) => g.capabilities);
  return [...new Set([...base, ...extra])];
}

export function recordBreakGlassEvent(
  event: Omit<BreakGlassEvent, "id" | "openedAt"> & { id?: string },
): BreakGlassEvent {
  const recorded: BreakGlassEvent = {
    id: event.id ?? `bg_${Date.now()}`,
    actorUserId: event.actorUserId,
    reason: event.reason,
    targetRole: event.targetRole,
    capabilities: event.capabilities,
    openedAt: new Date().toISOString(),
    closedAt: null,
    correlationId: event.correlationId,
  };
  breakGlassEvents.push(recorded);
  return recorded;
}

export function listBreakGlassEvents(): BreakGlassEvent[] {
  return [...breakGlassEvents];
}

export function listDelegationGrants(userId: string): DelegationGrant[] {
  const ts = new Date().toISOString();
  return delegationGrants.filter(
    (g) =>
      g.delegateUserId === userId &&
      !g.revokedAt &&
      g.startsAt <= ts &&
      g.expiresAt >= ts,
  );
}

export function detectPermissionConflicts(
  capabilities: readonly KnownCapability[],
): string[] {
  const set = new Set(capabilities);
  const conflicts: string[] = [];
  if (set.has("users.role.assign") && set.has("users.role.approve")) {
    conflicts.push(
      "Privileged role assignment SoD: same principal holds assign and approve",
    );
  }
  if (set.has("campaigns.write") && set.has("campaigns.approve")) {
    conflicts.push(
      "Campaign SoD: same principal holds write and approve (same-actor checks required)",
    );
  }
  return conflicts;
}
