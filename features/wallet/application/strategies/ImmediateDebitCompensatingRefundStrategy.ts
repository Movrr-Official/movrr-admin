import type { DomainEventBus } from "@/lib/events/DomainEventBus";
import { settleDebit } from "@/features/wallet/application/commands/settleDebit";
import { settleRefund } from "@/features/wallet/application/commands/settleRefund";
import type {
  LedgerRepository,
  SettlementService,
} from "@/features/wallet/application/contracts/SettlementService";

export type ImmediateDebitCompensatingRefundStrategyDeps = {
  ledger: LedgerRepository;
  eventBus: DomainEventBus;
};

/**
 * Canonical settlement strategy: immediate debit + compensating refund.
 * Never mutates/deletes prior debit rows; no point holds.
 */
export function createImmediateDebitCompensatingRefundStrategy(
  deps: ImmediateDebitCompensatingRefundStrategyDeps,
): SettlementService {
  return {
    debit: (input) => settleDebit(deps, input),
    refund: (input) => settleRefund(deps, input),
  };
}
