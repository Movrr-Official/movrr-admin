import { fail, ok, type ApplicationResult } from "@/lib/result/ApplicationResult";
import type { RequestContext } from "@/features/identity/domain/Principal";
import type { AuthorisationService } from "@/features/organisations/application/contracts/AuthorisationService";
import type {
  LedgerPage,
  LedgerPageInput,
  WalletBalance,
  LedgerRepository,
} from "@/features/wallet/application/contracts/WalletReadPort";

export type WalletQueries = {
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
