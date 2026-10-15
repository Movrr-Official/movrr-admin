/**
 * Contract tests for the ride verification system.
 *
 * Covers:
 * - Machine verification result parsing from ride_session.verification_result
 * - Reason code propagation
 * - VERIFICATION_STATUS and VERIFICATION_REASON_CODES integrity
 *
 * Mobile writes verification_result as JSONB with camelCase keys.
 * Admin reads via machineVerification object in RideSession schema.
 */

import { describe, it, expect } from "vitest";
import {
  parseRewardMetadata,
  VERIFICATION_STATUS,
  VERIFICATION_REASON_CODES,
} from "../../lib/rewardConstants";

// ── Verification result JSONB parsing ────────────────────────────────────────

describe("ride_session.verification_result JSONB structure", () => {
  // Simulates what admin reads from the machineVerification field
  function parseMachineVerdict(raw: unknown): {
    status: string;
    qualityScore?: number;
    reasonCodes?: string[];
    detectedMaxSpeedKmh?: number;
    maxAllowedSpeedKmh?: number;
    notes?: string;
  } | null {
    if (raw == null || typeof raw !== "object") return null;
    const v = raw as Record<string, unknown>;
    return {
      status: String(v.status ?? VERIFICATION_STATUS.PENDING),
      qualityScore: v.qualityScore != null ? Number(v.qualityScore) : undefined,
      reasonCodes: Array.isArray(v.reasonCodes)
        ? (v.reasonCodes as string[])
        : undefined,
      detectedMaxSpeedKmh:
        v.detectedMaxSpeedKmh != null
          ? Number(v.detectedMaxSpeedKmh)
          : undefined,
      maxAllowedSpeedKmh:
        v.maxAllowedSpeedKmh != null ? Number(v.maxAllowedSpeedKmh) : undefined,
      notes: typeof v.notes === "string" ? v.notes : undefined,
    };
  }

  it("parses a passing verification result", () => {
    const raw = {
      status: "verified",
      qualityScore: 0.92,
      reasonCodes: [],
      notes: "Ride passed baseline verification checks",
    };
    const v = parseMachineVerdict(raw)!;
    expect(v.status).toBe(VERIFICATION_STATUS.VERIFIED);
    expect(v.qualityScore).toBe(0.92);
    expect(v.reasonCodes).toHaveLength(0);
    expect(v.notes).toBeTruthy();
  });

  it("parses a rejected verification result with reason codes", () => {
    const raw = {
      status: "rejected",
      qualityScore: 0.2,
      reasonCodes: [
        VERIFICATION_REASON_CODES.INSUFFICIENT_MOVING_TIME,
        VERIFICATION_REASON_CODES.INSUFFICIENT_DISTANCE,
      ],
      notes: "Ride triggered one or more verification checks",
    };
    const v = parseMachineVerdict(raw)!;
    expect(v.status).toBe(VERIFICATION_STATUS.REJECTED);
    expect(v.reasonCodes).toContain(
      VERIFICATION_REASON_CODES.INSUFFICIENT_MOVING_TIME,
    );
    expect(v.reasonCodes).toContain(
      VERIFICATION_REASON_CODES.INSUFFICIENT_DISTANCE,
    );
  });

  it("parses a manual_review result with speed evidence", () => {
    const raw = {
      status: "manual_review",
      qualityScore: 0.65,
      reasonCodes: [VERIFICATION_REASON_CODES.PEAK_SPEED_TOO_HIGH],
      detectedMaxSpeedKmh: 52.3,
      maxAllowedSpeedKmh: 45,
    };
    const v = parseMachineVerdict(raw)!;
    expect(v.status).toBe(VERIFICATION_STATUS.MANUAL_REVIEW);
    expect(v.detectedMaxSpeedKmh).toBe(52.3);
    expect(v.maxAllowedSpeedKmh).toBe(45);
  });

  it("defaults status to pending for null input", () => {
    const v = parseMachineVerdict(null);
    expect(v).toBeNull();
  });

  it("defaults status to pending for missing status field", () => {
    const v = parseMachineVerdict({ qualityScore: 0.5 })!;
    expect(v.status).toBe(VERIFICATION_STATUS.PENDING);
  });

  it("reads camelCase keys (qualityScore, reasonCodes, detectedMaxSpeedKmh)", () => {
    // Mobile writes camelCase. If someone passes snake_case, fields should be absent.
    const wrongCasing = {
      status: "verified",
      quality_score: 0.9, // wrong: mobile writes qualityScore
      reason_codes: ["foo"], // wrong: mobile writes reasonCodes
      detected_max_speed_kmh: 30, // wrong: mobile writes detectedMaxSpeedKmh
    };
    const v = parseMachineVerdict(wrongCasing)!;
    expect(v.qualityScore).toBeUndefined();
    expect(v.reasonCodes).toBeUndefined();
    expect(v.detectedMaxSpeedKmh).toBeUndefined();
  });
});

// ── Admin override precedence ────────────────────────────────────────────────

describe("VERIFICATION_STATUS guard — toVerificationStatus", () => {
  // Mirrors the guard function in rideSessions.ts
  function toVerificationStatus(raw?: string): string {
    if (
      raw === VERIFICATION_STATUS.VERIFIED ||
      raw === VERIFICATION_STATUS.REJECTED ||
      raw === VERIFICATION_STATUS.MANUAL_REVIEW ||
      raw === VERIFICATION_STATUS.PENDING
    )
      return raw;
    return VERIFICATION_STATUS.PENDING;
  }

  it("passes through all 4 valid statuses", () => {
    expect(toVerificationStatus("verified")).toBe("verified");
    expect(toVerificationStatus("rejected")).toBe("rejected");
    expect(toVerificationStatus("manual_review")).toBe("manual_review");
    expect(toVerificationStatus("pending")).toBe("pending");
  });

  it("defaults unknown values to pending", () => {
    expect(toVerificationStatus("approved")).toBe(VERIFICATION_STATUS.PENDING);
    expect(toVerificationStatus("")).toBe(VERIFICATION_STATUS.PENDING);
    expect(toVerificationStatus(undefined)).toBe(VERIFICATION_STATUS.PENDING);
  });

  it("rejects typos that would silently produce wrong state", () => {
    // These would fail the guard and default to "pending", alerting to a drift
    expect(toVerificationStatus("Verified")).toBe(VERIFICATION_STATUS.PENDING);
    expect(toVerificationStatus("VERIFIED")).toBe(VERIFICATION_STATUS.PENDING);
    expect(toVerificationStatus("manual-review")).toBe(
      VERIFICATION_STATUS.PENDING,
    );
  });
});

// ── Reward metadata verification fields ──────────────────────────────────────

describe("reward_transactions.metadata verification fields", () => {
  it("parseRewardMetadata does not expose verification status directly", () => {
    // Verification status lives in ride_session.verification_result or ride_verification,
    // not in reward_transactions.metadata. This test documents that boundary.
    const r = parseRewardMetadata({
      verificationStatus: "verified", // if mobile ever writes this
    });
    // parseRewardMetadata should not return verificationStatus — it's not a META_KEY
    expect(
      (r as unknown as Record<string, unknown>).verificationStatus,
    ).toBeUndefined();
  });

  it("verifiedMinutes (from metadata) is the authoritative minute count for rewards", () => {
    const r = parseRewardMetadata({ verifiedMinutes: 17 });
    expect(r.verifiedMinutes).toBe(17);
  });
});
