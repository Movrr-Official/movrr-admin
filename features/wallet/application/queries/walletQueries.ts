import { fail, ok, type ApplicationResult } from "@/lib/result/ApplicationResult";
import type { RequestContext } from "@/features/identity/domain/Principal";
import type { AuthorisationService } from "@/features/organisations/application/contracts/AuthorisationService";
import type {
  LedgerPage,
  LedgerPageInput,
  WalletBalance,
  LedgerRepository,
  LedgerEntry,
} from "@/features/wallet/application/contracts/WalletReadPort";

export type WalletQueries = {
  getStatement: (
    ctx: RequestContext,
    riderScope?: string,
  ) => Promise<ApplicationResult<{ balance: WalletBalance; entries: LedgerEntry[] }>>;
  getBalance: (
    ctx: RequestContext,
    riderScope?: string,
  ) => Promise<ApplicationResult<WalletBalance>>;
  listTransactions: (
    ctx: RequestContext,
    riderScope?: string,
    page?: LedgerPageInput,
  ) => Promise<ApplicationResult<LedgerPage>>;
};

function resolveRiderId(
  ctx: RequestContext,
  riderScope?: string,
): ApplicationResult<string> {
  if (ctx.principal.type === "rider") {
    if (riderScope && riderScope !== ctx.principal.riderId)
      return fail("permission_denied", "Wallet not owned by rider");
    return ok(ctx.principal.riderId);
  }
  if (ctx.principal.type === "admin") {
    if (!riderScope || !/^[0-9a-f-]{36}$/i.test(riderScope))
      return fail("validation", "An explicit riderId is required for staff wallet reads");
    return ok(riderScope);
  }
  return fail("permission_denied", "Wallet reads require a rider principal");
}

export function createWalletQueries(deps: {
  authorisation: AuthorisationService;
  ledger: LedgerRepository;
}): WalletQueries {
  return {
    async getStatement(ctx, riderScope) {
      const authz = deps.authorisation.assertCapability(ctx, "wallet.read");
      if (!authz.ok) return authz;
      const riderId = resolveRiderId(ctx, riderScope);
      if (!riderId.ok) return riderId;
      // Same authoritative balance/ledger/balance consistency check, within one
      // authenticated request. No persistent cache and no financial mutation.
      for (let attempt = 0; attempt < 3; attempt++) {
        const balance = await deps.ledger.getBalance(riderId.value);
        const entries: LedgerEntry[] = [];
        const seen = new Set<string>();
        let cursor: string | null = null;
        do {
          const page = await deps.ledger.listEntries(riderId.value, {
            asOf: balance.asOf,
            ...(cursor ? { cursor } : {}),
          });
          if (page.asOf !== balance.asOf) return fail("InfrastructureFailure", "Wallet statement snapshot changed");
          entries.push(...page.entries);
          cursor = page.nextCursor;
          if (cursor && seen.has(cursor)) return fail("InfrastructureFailure", "Invalid Wallet pagination");
          if (cursor) seen.add(cursor);
        } while (cursor);
        const after = await deps.ledger.getBalance(riderId.value);
        if (balance.riderId !== riderId.value || after.riderId !== riderId.value || entries.some(entry => entry.riderId !== riderId.value))
          return fail("permission_denied", "Wallet not owned by rider");
        if (balance.transactionCount === after.transactionCount && balance.pointsBalance === after.pointsBalance && balance.lifetimePointsEarned === after.lifetimePointsEarned && entries.length === balance.transactionCount)
          return ok({ balance, entries });
      }
      return fail("ConcurrencyConflict", "Wallet changed during statement preparation. Please retry.");
    },
    async getBalance(ctx, riderScope) {
      const authz = deps.authorisation.assertCapability(ctx, "wallet.read");
      if (!authz.ok) return authz;
      const riderId = resolveRiderId(ctx, riderScope);
      if (!riderId.ok) return riderId;
      const balance = await deps.ledger.getBalance(riderId.value);
      return ok(balance);
    },
    async listTransactions(ctx, riderScope, page) {
      const authz = deps.authorisation.assertCapability(ctx, "wallet.read");
      if (!authz.ok) return authz;
      const riderId = resolveRiderId(ctx, riderScope);
      if (!riderId.ok) return riderId;
      return ok(await deps.ledger.listEntries(riderId.value, page));
    },
  };
}
