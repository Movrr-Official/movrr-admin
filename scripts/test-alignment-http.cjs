// Isolated HTTP contract verification. Invoked only by test-alignment-database --http.
const { execFileSync } = require("node:child_process");
const crypto = require("node:crypto"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  Module = require("node:module");
module.exports = async ({ db, user, rider, other, otherRider, operator, campaign }) => {
  const container = "movrr-alignment-api-" + process.pid,
    base = "http://127.0.0.1:55440",
    secret = "isolated-alignment-jwt-secret-not-production-2026";
  let count = 0;
  const equal = (a, b) => {
    assert.deepEqual(a, b);
    count++;
  };
  const token = (sub, role = "authenticated") => {
    const a = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString(
        "base64url",
      ),
      b = Buffer.from(
        JSON.stringify({
          sub,
          role,
          aal: "aal2",
          exp: Math.floor(Date.now() / 1000) + 600,
        }),
      ).toString("base64url");
    return (
      a +
      "." +
      b +
      "." +
      crypto
        .createHmac("sha256", secret)
        .update(a + "." + b)
        .digest("base64url")
    );
  };
  const rpc = async (actor, name, input = {}, role = "authenticated") => {
    const response = await fetch(`${base}/rpc/${name}`, {
      method: "POST",
          signal: AbortSignal.timeout(10000),
      headers: {
        Authorization: "Bearer " + token(actor, role),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    });
    return { status: response.status, data: await response.json() };
  };
  await db.unsafe(
    "GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO service_role",
  );
  try {
    execFileSync(
      "docker",
      [
        "run",
        "--detach",
        "--name",
        container,
        "--label",
        "movrr.task=enterprise-alignment",
        "--publish",
        "127.0.0.1:55440:3000",
        "--env",
        `PGRST_DB_URI=postgres://postgres:isolated-local-test-only@host.docker.internal:55439/${db.options.database}`,
        "--env",
        "PGRST_DB_ANON_ROLE=anon",
        "--env",
        `PGRST_JWT_SECRET=${secret}`,
        "--env",
        "PGRST_DB_SCHEMAS=public",
        "public.ecr.aws/supabase/postgrest:v16.4",
      ],
      { stdio: "pipe" },
    );
    let ready = false;
    for (let i = 0; i < 40; i++) {
      try {
        const r = await fetch(base, {signal: AbortSignal.timeout(1500)});
        if (r.ok) {
          ready = true;
          break;
        }
      } catch {}
      await new Promise((r) => setTimeout(r, 250));
    }
    assert(ready, "Isolated API startup failed");
    equal(
      (
        await fetch(`${base}/rpc/get_my_campaign_catalog`, {
          method: "POST",
          signal: AbortSignal.timeout(10000),
          headers: {
            Authorization: "Bearer " + token(user) + "tampered",
            "Content-Type": "application/json",
          },
          body: "{}",
        })
      ).status,
      401,
    );
    const catalog = await rpc(user, "get_my_campaign_catalog");
    assert.equal(catalog.status, 200, JSON.stringify(catalog));
    count++;
    equal(
      catalog.data.some((c) => c.id === campaign),
      true,
    );
    const summaries = await rpc(user, "get_my_ride_summary_page", { p_limit: 2 });
    equal(summaries.status, 200);
    equal(summaries.data.summaries.length, 2);
    equal(
      (
        await rpc(other, "get_my_ride_summary", {
          p_session_id: summaries.data.summaries[0].rideSessionId,
        })
      ).data,
      null,
    );
    equal(
      (
        await rpc(user, "ops_incident_command", {
          p_id: null,
          p_status: null,
          p_expected: null,
          p_payload: { title: "Denied", severity: "low" },
          p_operation: crypto.randomUUID(),
        })
      ).status,
      403,
    );
    await db`UPDATE "user" SET status='suspended' WHERE id=${user}`;
    equal((await rpc(user, "get_my_campaign_catalog")).status, 403);
    equal((await rpc(user, "get_my_ride_summary_page")).status, 403);
    await db`UPDATE "user" SET status='active' WHERE id=${user}`;
    // Repository runs unchanged against real PostgREST, with only its client factory supplied locally.
    const { createClient } = require("@supabase/supabase-js");
    const client = createClient(base, "local-test-only", {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        headers: { Authorization: "Bearer " + token(operator, "service_role") },
        fetch: (url, init) => fetch(String(url).replace("/rest/v1/", "/"), { ...init, signal: AbortSignal.timeout(10000) }),
      },
    });
    const file = path.join(
        __dirname,
        "../features/wallet/infrastructure/supabaseLedgerRepository.ts",
      ),
      m = new Module(file, module);
    m.filename = file;
    m.paths = Module._nodeModulePaths(path.dirname(file));
    const original = m.require.bind(m);
    m.require = (name) =>
      name === "server-only"
        ? {}
        : name === "@/lib/supabase-admin"
          ? { createSupabaseAdminClient: () => client }
          : original(name);
    m._compile(
      require("typescript").transpileModule(fs.readFileSync(file, "utf8"), {
        compilerOptions: { module: 1, target: 9, esModuleInterop: true },
      }).outputText,
      file,
    );
    const repo = m.exports.createSupabaseLedgerRepository();
    // Signed credits/debits/refunds with tied timestamps exercise deterministic id tie-breaking.
    await db`INSERT INTO reward_transactions(rider_id,points_earned,source,metadata) SELECT ${rider},CASE WHEN g=101 THEN -30 WHEN g=102 THEN 30 ELSE 1 END,'adjustment',CASE WHEN g=101 THEN '{"redemption_id":"fixture","settlement_kind":"debit"}'::jsonb WHEN g=102 THEN '{"redemption_id":"fixture","settlement_kind":"compensating_refund"}'::jsonb ELSE '{}'::jsonb END FROM generate_series(1,102) g`;
    const totals = (
      await db`SELECT sum(points_earned)::int balance,sum(greatest(points_earned,0))::int lifetime,count(*)::int n FROM reward_transactions WHERE rider_id=${rider}`
    )[0];
    await db`INSERT INTO rider_reward_balance(rider_id,points_balance,lifetime_points_earned) VALUES(${rider},${totals.balance},${totals.lifetime}) ON CONFLICT(rider_id) DO UPDATE SET points_balance=excluded.points_balance,lifetime_points_earned=excluded.lifetime_points_earned`;
    const balance = await repo.getBalance(rider);
    equal(balance.pointsBalance, totals.balance);
    equal(balance.transactionCount, totals.n);
    let cursor,
      entries = [];
    do {
      const p = await repo.listEntries(rider, { cursor, asOf: balance.asOf });
      entries.push(...p.entries);
      cursor = p.nextCursor;
    } while (cursor);
    equal(entries.length, totals.n);
    equal(new Set(entries.map((x) => x.id)).size, totals.n);
    equal(
      entries.reduce((s, x) => s + x.points, 0),
      balance.pointsBalance,
    );
    equal(entries.find((x) => x.points === -30).category, "redemption");
    equal(entries.find((x) => x.category === "refund").points, 30);
    equal(
      entries.every((x) => x.riderId === rider),
      true,
    );
    // Exercise the actual web parsers against HTTP responses, not hand-built DTOs.
    const appRoot = path.resolve(__dirname, "../../movrr-app");
    const load = (relative, ports = {}) => {
      const f = path.join(appRoot, relative),
        x = new Module(f, module);
      x.filename = f;
      x.paths = Module._nodeModulePaths(path.dirname(f));
      const real = x.require.bind(x);
      x.require = (k) => (k in ports ? ports[k] : real(k));
      x._compile(
        require("typescript").transpileModule(fs.readFileSync(f, "utf8"), {
          compilerOptions: { module: 1, target: 9, esModuleInterop: true },
        }).outputText,
        f,
      );
      return x.exports;
    };
    const webFetch = async (endpoint) => {
      const url = new URL(endpoint, "http://isolated.test");
      if (url.pathname === "/wallet/balance") return repo.getBalance(rider);
      if (url.pathname === "/wallet/transactions")
        return repo.listEntries(rider, {
          cursor: url.searchParams.get("cursor") ?? undefined,
          asOf: url.searchParams.get("asOf") ?? undefined,
        });
      const r = await rpc(
        user,
        url.pathname.endsWith("campaigns")
          ? "get_my_campaign_catalog"
          : "get_my_ride_summary_page",
        {},
      );
      assert.equal(r.status, 200);
      return r.data;
    };
    const ports = {
      "@/lib/appUser": {
        requireProductSession: async () => ({
          appUser: { id: user },
          riderProfile: { id: rider },
        }),
      },
      "@/lib/platform/client": { platformFetch: webFetch },
      "./client": { platformFetch: webFetch },
      "@/lib/platform/types": load("lib/platform/types.ts"),
    };
    const webWallet = load("lib/platform/riderPlatform.ts", ports);
    const statement = await webWallet.getWalletStatement();
    equal(statement.entries.length, totals.n);
    equal(statement.balance.pointsBalance, totals.balance);
    const webCampaigns = load("lib/platform/campaignPlatform.ts", ports);
    equal(
      (await webCampaigns.listRiderCampaigns()).some((c) => c.id === campaign),
      true,
    );
    const webRides = load("lib/platform/riderSelfService.ts", ports);
    equal((await webRides.listRideSummaries()).summaries.length, 4);
    await db`DELETE FROM rider_reward_balance WHERE rider_id=${rider}`;
    await assert.rejects(() => repo.getBalance(rider), /unavailable/);
    count++;
    // Service-only financial readers cannot be invoked by a rider JWT.
    equal(
      (await rpc(user, "read_rider_wallet_snapshot", { p_rider: otherRider })).status,
      403,
    );
    const page1 = await rpc(
      operator,
      "ops_ride_session_page",
      { p_filters: { page: 0, pageSize: 2 } },
      "service_role",
    );
    assert.equal(page1.status, 200, JSON.stringify(page1));
    count++;
    // Exact lookup must find an old session outside the first 500 newer records.
    const old = summaries.data.summaries[0].rideSessionId;
    await db`INSERT INTO ride_session(rider_id,status,earning_mode,started_at,created_at) SELECT ${otherRider},'active','standard_ride',now()+interval '1 minute',now()+interval '1 minute' FROM generate_series(1,550)`;
    const exact = await rpc(
      operator,
      "ops_ride_session_page",
      { p_filters: { searchQuery: old, pageSize: 10, asOf: "2099-01-01T00:00:00Z" } },
      "service_role",
    );
    equal(exact.status, 200);
    equal(
      exact.data.map((x) => x.id),
      [old],
    );
    const filter = await rpc(
      operator,
      "ops_ride_session_page",
      { p_filters: { riderId: rider, earningMode: "ad_enhanced_ride", pageSize: 10 } },
      "service_role",
    );
    equal(filter.status, 200);
    equal(filter.data.length, 1);
    equal(filter.data[0].earning_mode, "ad_enhanced_ride");
    const p2 = await rpc(
      operator,
      "ops_ride_session_page",
      { p_filters: { page: 1, pageSize: 2 } },
      "service_role",
    );
    equal(p2.status, 200);
    equal(new Set([...page1.data, ...p2.data].map((x) => x.id)).size, 4);
    console.log(
      JSON.stringify({
        httpAssertions: count,
        transport: "PostgREST 16.4",
        realRepository: true,
        productionMutations: false,
      }),
    );
  } finally {
    try {
      execFileSync("docker", ["rm", "--force", container], { stdio: "pipe" });
    } catch {}
  }
  return count;
};
