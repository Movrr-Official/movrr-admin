import { randomUUID } from "crypto";
import {
  createFulfilment,
  type Fulfilment,
  type FulfilmentEvent,
} from "@/features/fulfilment/domain/Fulfilment";
import type { FulfilmentOutcome } from "@/features/fulfilment/domain/outcome";
import type { FulfilmentState } from "@/features/fulfilment/domain/states";
import { isLegalTransition } from "@/features/fulfilment/domain/transitions";
import { fail, ok, type ApplicationResult } from "@/lib/result/ApplicationResult";

export type FulfilmentStateMachine = {
  requestTransition(
    fulfilment: Fulfilment,
    to: FulfilmentState,
    reason: string,
    expectedVersion: number,
  ): ApplicationResult<Fulfilment>;
};

function outcomeFor(to: FulfilmentState): FulfilmentOutcome | null {
  switch (to) {
    case "completed":
      return "success";
    case "cancelled":
      return "cancelled";
    case "failed":
      return "failed";
    case "expired":
      return "expired";
    case "refunded":
      return "refunded";
    case "reversed":
      return "reversed";
    default:
      return null;
  }
}

function newEventId(): string {
  return randomUUID();
}

export function createFulfilmentStateMachine(): FulfilmentStateMachine {
  return {
    requestTransition(fulfilment, to, reason, expectedVersion) {
      if (fulfilment.version !== expectedVersion) {
        return fail(
          "ConcurrencyConflict",
          `Expected version ${expectedVersion} but aggregate is at ${fulfilment.version}`,
        );
      }

      if (
        !isLegalTransition(fulfilment.fulfilmentType, fulfilment.state, to)
      ) {
        return fail(
          "IllegalTransition",
          `Illegal transition ${fulfilment.state} → ${to} for ${fulfilment.fulfilmentType}`,
        );
      }

      const occurredAt = new Date().toISOString();
      const event: FulfilmentEvent = {
        id: newEventId(),
        fulfilmentId: fulfilment.id,
        fromState: fulfilment.state,
        toState: to,
        reason,
        occurredAt,
      };

      const nextOutcome = outcomeFor(to);
      const next = createFulfilment({
        ...fulfilment,
        state: to,
        version: fulfilment.version + 1,
        outcome: nextOutcome ?? fulfilment.outcome,
        completedAt:
          to === "completed" ? occurredAt : fulfilment.completedAt,
        events: [...fulfilment.events, event],
      });

      return ok(next);
    },
  };
}
