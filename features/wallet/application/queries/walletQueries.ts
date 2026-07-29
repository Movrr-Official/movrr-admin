import { fail, ok, type ApplicationResult } from "@/lib/result/ApplicationResult";
import type { RequestContext } from "@/features/identity/domain/Principal";
import type { AuthorisationService } from "@/features/organisations/application/contracts/AuthorisationService";
import type {
  LedgerEntry,
  LedgerRepository,
} from "@/features/wallet/application/contracts/SettlementService";

export type WalletBalanceReadModel = {
  riderId: string;
  balance: number;
};

export type WalletQueries = {
  getBalance: (
    ctx: RequestContext,
  ) => Promise<ApplicationResult<WalletBalanceReadModel>>;
  listTransactions: (
    ctx: RequestContext,
  ) => Promise<ApplicationResult<LedgerEntry[]>>;
};

function resolveRiderId(ctx: RequestContext): ApplicationResult<string> {
  if (ctx.principal.type === "rider") {
    return ok(ctx.principal.riderId);
  }
  if (ctx.principal.type === "admin") {
    // Admin wallet reads require an explicit rider scope in later plans;
    // Phase 1 returns zero-balance placeholder for the acting admin user key.
    return ok(`admin:${ctx.principal.adminUserId}`);
  }
  return fail("permission_denied", "Wallet reads require a rider principal");
}

export function createWalletQueries(deps: {
  authorisation: AuthorisationService;
  ledger: LedgerRepository;
}): WalletQueries {
  return {
    async getBalance(ctx) {
      const authz = deps.authorisation.assertCapability(ctx, "wallet.read");
      if (!authz.ok) return authz;
      const riderId = resolveRiderId(ctx);
      if (!riderId.ok) return riderId;
      const balance = await deps.ledger.getBalance(riderId.value);
      return ok({ riderId: riderId.value, balance });
    },
    async listTransactions(ctx) {
      const authz = deps.authorisation.assertCapability(ctx, "wallet.read");
      if (!authz.ok) return authz;
      const riderId = resolveRiderId(ctx);
      if (!riderId.ok) return riderId;
      return ok(await deps.ledger.listEntries(riderId.value));
    },
  };
}
