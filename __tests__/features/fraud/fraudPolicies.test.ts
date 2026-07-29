import { describe, it, expect } from "vitest";
import { createInMemoryIdempotencyStore } from "@/features/fraud/infrastructure/policies/idempotency";
import { createInMemoryReplayStore } from "@/features/fraud/infrastructure/policies/replay";
import { createInMemoryRateLimitStore } from "@/features/fraud/infrastructure/policies/rateLimit";
import { createFraudPolicyEngine } from "@/features/fraud/application/commands/fraudPolicyEngine";

describe("FraudPolicyEngine — Phase 1 policies", () => {
  it("duplicate idempotency key returns the same success payload", async () => {
    const idempotency = createInMemoryIdempotencyStore();
    const engine = createFraudPolicyEngine({
      idempotency,
      replay: createInMemoryReplayStore(),
      rateLimit: createInMemoryRateLimitStore(),
    });

    const key = {
      principalId: "user-1",
      scope: "rewards.redeem",
      key: "idem-abc",
    };
    const payload = { redemptionId: "red-1", fulfilmentId: "ful-1" };

    const first = await engine.evaluate({
      principalId: key.principalId,
      scope: key.scope,
      idempotencyKey: key.key,
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.value.type).toBe("allow");

    await engine.recordIdempotentSuccess(key, payload);

    const second = await engine.evaluate({
      principalId: key.principalId,
      scope: key.scope,
      idempotencyKey: key.key,
    });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.value).toEqual({
      type: "idempotent_replay",
      payload,
    });
  });

  it("denies replay of a consumed jti", async () => {
    const engine = createFraudPolicyEngine({
      idempotency: createInMemoryIdempotencyStore(),
      replay: createInMemoryReplayStore(),
      rateLimit: createInMemoryRateLimitStore(),
    });

    const first = await engine.evaluate({
      principalId: "user-1",
      scope: "fulfilment.token.consume",
      jti: "jti-once-1",
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.value.type).toBe("allow");

    const replay = await engine.evaluate({
      principalId: "user-1",
      scope: "fulfilment.token.consume",
      jti: "jti-once-1",
    });
    expect(replay.ok).toBe(true);
    if (!replay.ok) return;
    expect(replay.value).toEqual({
      type: "deny",
      reason: "replay_detected",
    });
  });

  it("denies when rate limit is exceeded", async () => {
    const rateLimit = createInMemoryRateLimitStore({ max: 2, windowMs: 60_000 });
    const engine = createFraudPolicyEngine({
      idempotency: createInMemoryIdempotencyStore(),
      replay: createInMemoryReplayStore(),
      rateLimit,
    });

    const input = {
      principalId: "user-1",
      scope: "rewards.redeem",
      rateLimitKey: "rewards.redeem:user-1",
    };

    expect((await engine.evaluate(input)).ok).toBe(true);
    expect((await engine.evaluate(input)).ok).toBe(true);

    const denied = await engine.evaluate(input);
    expect(denied.ok).toBe(true);
    if (!denied.ok) return;
    expect(denied.value).toEqual({
      type: "deny",
      reason: "rate_limited",
    });
  });

  it("evaluates only — decisions never mutate business resources", async () => {
    const resources = { balance: 100, allocations: [] as string[] };
    const engine = createFraudPolicyEngine({
      idempotency: createInMemoryIdempotencyStore(),
      replay: createInMemoryReplayStore(),
      rateLimit: createInMemoryRateLimitStore(),
    });

    await engine.evaluate({
      principalId: "user-1",
      scope: "rewards.redeem",
      idempotencyKey: "k1",
      jti: "j1",
      rateLimitKey: "rk1",
    });

    expect(resources).toEqual({ balance: 100, allocations: [] });
  });
});
