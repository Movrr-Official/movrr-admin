import { describe, expect, it } from "vitest";
import { redactLogContext } from "@/lib/logRedaction";

describe("logRedaction", () => {
  it("redacts bearer tokens in strings", () => {
    const result = redactLogContext({
      header: "Authorization: Bearer secret-token-value",
    }) as Record<string, unknown>;
    expect(String(result.header)).not.toContain("secret-token-value");
  });

  it("redacts sensitive object keys", () => {
    const result = redactLogContext({
      access_token: "abc",
      lat: 51.92,
      count: 3,
    }) as Record<string, unknown>;
    expect(result.access_token).toBe("[REDACTED]");
    expect(result.lat).toBe("[REDACTED]");
    expect(result.count).toBe(3);
  });
});
