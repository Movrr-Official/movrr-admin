import { describe, expect, it } from "vitest";
import {
  isRiderApiPath,
  matchesAnyPathPrefix,
  matchesPathPrefix,
} from "@/lib/pathMatch";
import { paths } from "@/constant/path";

describe("matchesPathPrefix", () => {
  it("matches exact and nested auth paths", () => {
    expect(matchesPathPrefix("/auth", "/auth")).toBe(true);
    expect(matchesPathPrefix("/auth/signin", "/auth")).toBe(true);
    expect(matchesPathPrefix("/auth/mfa/challenge", "/auth")).toBe(true);
  });

  it("does not match /authorization as under /auth", () => {
    expect(matchesPathPrefix("/authorization", "/auth")).toBe(false);
    expect(matchesPathPrefix("/authorization", "/authorization")).toBe(true);
  });

  it("does not match false prefix siblings", () => {
    expect(matchesPathPrefix("/unauthorized", "/auth")).toBe(false);
    expect(matchesPathPrefix("/settings", "/auth")).toBe(false);
    expect(matchesPathPrefix("/authenticate", "/auth")).toBe(false);
  });
});

describe("chrome hide path list", () => {
  it("hides chrome on auth and unauthorized only", () => {
    expect(matchesAnyPathPrefix("/auth/signin", paths)).toBe(true);
    expect(matchesAnyPathPrefix("/unauthorized", paths)).toBe(true);
    expect(matchesAnyPathPrefix("/authorization", paths)).toBe(false);
    expect(matchesAnyPathPrefix("/settings", paths)).toBe(false);
    expect(matchesAnyPathPrefix("/", paths)).toBe(false);
  });
});

describe("rider API JWT boundary", () => {
  it.each([
    "/api/v1/wallet/balance",
    "/api/v1/wallet/transactions",
    "/api/v1/rewards/redeem",
    "/api/v1/rewards/redemptions",
    "/api/v1/rewards/catalog/item",
    "/api/v1/fulfilment/id/token",
    "/api/v1/riders/me/campaigns/confirm",
    "/api/v1/community-rides/id/join",
  ])("allows %s to reach its JWT handler", (path) =>
    expect(isRiderApiPath(path)).toBe(true),
  );
  it.each([
    "/api/v1/fulfilment/id/refund",
    "/api/v1/fulfilment/id/cancel",
    "/api/v1/internal/jobs",
    "/api/v1/rewards/admin",
    "/api/v1/wallet/balance/other",
    "/riders",
  ])("keeps %s behind its existing dashboard gate", (path) =>
    expect(isRiderApiPath(path)).toBe(false),
  );
});
