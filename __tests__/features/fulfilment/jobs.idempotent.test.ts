import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { DomainEventBus } from "@/lib/events/DomainEventBus";
import { FULFILMENT_TYPES } from "@/features/fulfilment/domain/Fulfilment";
import { createFulfilmentStateMachine } from "@/features/fulfilment/application/FulfilmentStateMachine";
import { createHandlerRegistry } from "@/features/fulfilment/application/HandlerRegistry";
import { createFulfilmentEngine } from "@/features/fulfilment/application/FulfilmentEngine";
import { createInstantDigitalHandler } from "@/features/fulfilment/application/handlers/InstantDigitalHandler";
import { createQrBarcodeHandler } from "@/features/fulfilment/application/handlers/QrBarcodeHandler";
import { createUnsupportedFulfilmentHandler } from "@/features/fulfilment/application/handlers/UnsupportedFulfilmentHandler";
import { createGeneratedDigitalResourceProvider } from "@/features/fulfilment/infrastructure/providers/GeneratedDigitalResourceProvider";
import { createVoucherPoolResourceProvider } from "@/features/fulfilment/infrastructure/providers/VoucherPoolResourceProvider";
import { createTokenService } from "@/features/fulfilment/application/commands/tokenService";
import { createInMemoryLedgerRepository } from "@/features/wallet/infrastructure/ledgerRepository";
import { createImmediateDebitCompensatingRefundStrategy } from "@/features/wallet/application/strategies/ImmediateDebitCompensatingRefundStrategy";
import type { ResourceAllocationService } from "@/features/fulfilment/application/contracts/ResourceAllocationService";
import type { FulfilmentResourceProvider } from "@/features/fulfilment/application/contracts/FulfilmentResourceProvider";
import { expireFulfilments } from "@/features/fulfilment/application/commands/expireFulfilments";
import { releaseStaleReservations } from "@/features/fulfilment/application/commands/releaseStaleReservations";
import { retryTransientInfrastructure } from "@/features/fulfilment/application/commands/retryTransientInfrastructure";
import { POST as expireRoute } from "@/app/api/v1/internal/jobs/fulfilment-expire/route";
import { POST as releaseRoute } from "@/app/api/v1/internal/jobs/fulfilment-release/route";
import { POST as retryRoute } from "@/app/api/v1/internal/jobs/fulfilment-retry/route";

function asResourceService(
  provider: FulfilmentResourceProvider,
): ResourceAllocationService {
  return {
    allocate: (input) => provider.allocate(input),
    release: (input) => provider.release(input),
    fulfil: (input) => provider.fulfil(input),
  };
}

async function buildEngine(opts?: {
  pool?: ReturnType<typeof createVoucherPoolResourceProvider>;
}) {
  const bus = new DomainEventBus();
  const ledger = createInMemoryLedgerRepository();
  await ledger.seedBalance("rider-1", 100);
  const settlement = createImmediateDebitCompensatingRefundStrategy({
    ledger,
    eventBus: bus,
  });
  await settlement.debit({
    riderId: "rider-1",
    points: 25,
    redemptionId: "red-job-1",
    correlationId: "corr-job-debit",
  });

  const generated = createGeneratedDigitalResourceProvider();
  const pool = opts?.pool ?? createVoucherPoolResourceProvider();
  const tokens = createTokenService({ eventBus: bus });
  const sm = createFulfilmentStateMachine();
  const registry = createHandlerRegistry();
  const unsupported = createUnsupportedFulfilmentHandler();
  const instant = createInstantDigitalHandler({
    resources: asResourceService(generated),
  });
  const qr = createQrBarcodeHandler({
    resources: asResourceService(pool),
    tokens,
  });

  for (const type of FULFILMENT_TYPES) {
    if (type === "instant_digital") registry.register(type, instant);
    else if (type === "qr_barcode") registry.register(type, qr);
    else registry.register(type, unsupported);
  }
  registry.freeze();

  const engine = createFulfilmentEngine({
    stateMachine: sm,
    registry,
    settlement,
    tokens,
  });

  return { engine, ledger, tokens, pool, bus };
}

describe("scheduled fulfilment jobs", () => {
  const previousSecret = process.env.INTERNAL_JOB_SECRET;

  beforeEach(() => {
    process.env.INTERNAL_JOB_SECRET = "test-job-secret";
  });

  afterEach(() => {
    if (previousSecret === undefined) {
      delete process.env.INTERNAL_JOB_SECRET;
    } else {
      process.env.INTERNAL_JOB_SECRET = previousSecret;
    }
  });

  it("expires past expires_at via engine/SM and is idempotent on second run", async () => {
    const pool = createVoucherPoolResourceProvider();
    await pool.seedPool("res-job-exp", [{ id: "item-exp", code: "EXP-1" }]);
    const { engine, pool: usedPool } = await buildEngine({ pool });

    const past = new Date(Date.now() - 60_000).toISOString();
    await engine.createFromRedemption({
      id: "ful-job-exp",
      redemptionId: "red-job-1",
      riderId: "rider-1",
      catalogItemId: "cat-1",
      fulfilmentType: "qr_barcode",
      idempotencyKey: "idem-job-exp",
      resourceId: "res-job-exp",
      pointsCost: 25,
      correlationId: "corr-job-exp",
      expiresAt: past,
    });

    const started = await engine.start("ful-job-exp");
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    expect(started.value.fulfilment.state).toBe("awaiting_collection");

    const first = await expireFulfilments({
      engine,
      now: new Date(),
    });
    expect(first.expired).toBe(1);
    expect(first.skipped).toBe(0);

    const afterFirst = await engine.get("ful-job-exp");
    expect(afterFirst.ok).toBe(true);
    if (!afterFirst.ok) return;
    expect(afterFirst.value.state).toBe("expired");
    expect(afterFirst.value.outcome).toBe("expired");
    const versionAfterFirst = afterFirst.value.version;

    const reallocated = await usedPool.allocate({
      fulfilmentId: "ful-job-exp-2",
      resourceId: "res-job-exp",
    });
    expect(reallocated.ok).toBe(true);

    const second = await expireFulfilments({
      engine,
      now: new Date(),
    });
    expect(second.expired).toBe(0);
    expect(second.skipped).toBeGreaterThanOrEqual(0);

    const afterSecond = await engine.get("ful-job-exp");
    expect(afterSecond.ok).toBe(true);
    if (!afterSecond.ok) return;
    expect(afterSecond.value.state).toBe("expired");
    expect(afterSecond.value.version).toBe(versionAfterFirst);
  });

  it("releaseStaleReservations cancels reserved fulfilments via engine (releases pool)", async () => {
    const pool = createVoucherPoolResourceProvider();
    await pool.seedPool("res-job-rel", [{ id: "item-rel", code: "REL-1" }]);
    const { engine } = await buildEngine({ pool });

    // Force stop at reserved by using a custom path: create + start normally
    // then we need reserved state. QR start goes past reserved quickly.
    // Use engine.expire path isn't right — use cancel after we create a reserved
    // fulfilment via start then... Actually QR can't stop at reserved easily.
    // Create fulfilment and transition to reserved via a partial start isn't available.
    // Instead: create QR, start (awaiting_collection with reserved allocation),
    // then releaseStale with candidate list that includes it.
    await engine.createFromRedemption({
      id: "ful-job-rel",
      redemptionId: "red-job-1",
      riderId: "rider-1",
      catalogItemId: "cat-1",
      fulfilmentType: "qr_barcode",
      idempotencyKey: "idem-job-rel",
      resourceId: "res-job-rel",
      pointsCost: 25,
      correlationId: "corr-job-rel",
    });
    const started = await engine.start("ful-job-rel");
    expect(started.ok).toBe(true);

    const result = await releaseStaleReservations({
      engine,
      candidateIds: ["ful-job-rel"],
    });
    expect(result.released).toBe(1);

    const after = await engine.get("ful-job-rel");
    expect(after.ok).toBe(true);
    if (!after.ok) return;
    expect(after.value.state).toBe("cancelled");

    const again = await releaseStaleReservations({
      engine,
      candidateIds: ["ful-job-rel"],
    });
    expect(again.released).toBe(0);

    const reallocated = await pool.allocate({
      fulfilmentId: "ful-job-rel-2",
      resourceId: "res-job-rel",
    });
    expect(reallocated.ok).toBe(true);
  });

  it("retryTransientInfrastructure is a safe no-op for phase 1", async () => {
    const result = await retryTransientInfrastructure();
    expect(result.retried).toBe(0);
  });

  it("job command modules never assign fulfilment.state directly", () => {
    const root = join(process.cwd(), "features/fulfilment/application/commands");
    for (const file of [
      "expireFulfilments.ts",
      "releaseStaleReservations.ts",
      "retryTransientInfrastructure.ts",
    ]) {
      const source = readFileSync(join(root, file), "utf8");
      // Assignment only — comparisons like state === "expired" are allowed.
      expect(source).not.toMatch(/\.state\s*=(?!=)/);
      expect(source).not.toMatch(/\bUPDATE\b/i);
    }
  });

  it("internal job routes require x-internal-job-secret", async () => {
    const unauthorized = await expireRoute(
      new Request("http://localhost/api/v1/internal/jobs/fulfilment-expire", {
        method: "POST",
      }),
    );
    expect(unauthorized.status).toBe(401);

    const authorized = await expireRoute(
      new Request("http://localhost/api/v1/internal/jobs/fulfilment-expire", {
        method: "POST",
        headers: { "x-internal-job-secret": "test-job-secret" },
      }),
    );
    expect(authorized.status).toBe(200);

    const releaseUnauthorized = await releaseRoute(
      new Request("http://localhost/api/v1/internal/jobs/fulfilment-release", {
        method: "POST",
      }),
    );
    expect(releaseUnauthorized.status).toBe(401);

    const releaseAuthorized = await releaseRoute(
      new Request("http://localhost/api/v1/internal/jobs/fulfilment-release", {
        method: "POST",
        headers: { "x-internal-job-secret": "test-job-secret" },
      }),
    );
    expect(releaseAuthorized.status).toBe(200);

    const retryUnauthorized = await retryRoute(
      new Request("http://localhost/api/v1/internal/jobs/fulfilment-retry", {
        method: "POST",
      }),
    );
    expect(retryUnauthorized.status).toBe(401);

    const retryAuthorized = await retryRoute(
      new Request("http://localhost/api/v1/internal/jobs/fulfilment-retry", {
        method: "POST",
        headers: { "x-internal-job-secret": "test-job-secret" },
      }),
    );
    expect(retryAuthorized.status).toBe(200);
  });
});
