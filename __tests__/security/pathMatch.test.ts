import { describe, expect, it } from "vitest";
import {
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
