/**
 * Runtime drift detection for the mobile ↔ admin data contract.
 *
 * Provides:
 *   - Type guards for canonical enum values (isKnownBonusType, isKnownRewardSource)
 *   - validateRewardMetadata() — structured violation list for a single transaction
 *   - warnContractViolations() — dev-mode console output
 *
 * These utilities are consumed by the contract health server action to surface
 * drift in the admin diagnostics panel without breaking production flows.
 * Every check is non-throwing — violations are collected, not raised.
 */

import {
  parseRewardMetadata,
  BONUS_TYPE,
  REWARD_SOURCE,
  type ParsedRewardMetadata,
} from "./rewardConstants";

// ── Types ─────────────────────────────────────────────────────────────────────

export type ViolationSeverity = "critical" | "warning" | "info";

export interface ContractViolation {
  severity: ViolationSeverity;
  field: string;
  message: string;
  value?: unknown;
}

export interface RewardTransactionHealthRow {
  id: string;
  source: string | null;
  metadata: unknown;
  createdAt: string;
}

export interface ContractHealthReport {
  checkedAt: string;
  windowDays: number;
  totalTransactions: number;
  healthyTransactions: number;
  healthScore: number;
  criticalCount: number;
  warningCount: number;
  unrecognizedBonusTypes: string[];
  unrecognizedSources: string[];
  missingRideSessionId: number;
  missingVerifiedMinutes: number;
  missingBasePoints: number;
  sampleViolations: Array<{
    transactionId: string;
    violations: ContractViolation[];
  }>;
}

// ── Type guards ───────────────────────────────────────────────────────────────

const KNOWN_BONUS_TYPES = new Set(Object.values(BONUS_TYPE));
const KNOWN_REWARD_SOURCES = new Set(Object.values(REWARD_SOURCE));

export function isKnownBonusType(type: string): boolean {
  return KNOWN_BONUS_TYPES.has(
    type as (typeof BONUS_TYPE)[keyof typeof BONUS_TYPE],
  );
}

export function isKnownRewardSource(source: string): boolean {
  return KNOWN_REWARD_SOURCES.has(
    source as (typeof REWARD_SOURCE)[keyof typeof REWARD_SOURCE],
  );
}

// ── Single-transaction validator ──────────────────────────────────────────────

/**
 * Returns structured violations for a single reward_transactions.metadata blob.
 * Empty array means the record is fully contract-compliant.
 *
 * Severities:
 *   critical — field required for correct admin function (session linkage, payout display)
 *   warning  — field expected but optional; absence degrades auditability
 *   info     — unknown value observed; may indicate mobile shipped a new type
 */
export function validateRewardMetadata(raw: unknown): ContractViolation[] {
  const violations: ContractViolation[] = [];
  const meta: ParsedRewardMetadata = parseRewardMetadata(raw);

  // ── Critical: session linkage ───────────────────────────────────────────────
  if (!meta.rideSessionId) {
    violations.push({
      severity: "critical",
      field: "rideSessionId",
      message:
        "Missing rideSessionId — reward transaction cannot be linked to a ride session. " +
        "The session reward drawer and provenance chain will be empty.",
    });
  }

  // ── Warning: payout auditability chain ─────────────────────────────────────
  if (meta.verifiedMinutes == null) {
    violations.push({
      severity: "warning",
      field: "verifiedMinutes",
      message:
        "Missing verifiedMinutes — admin cannot verify the base points calculation " +
        "without the confirmed moving-time input.",
    });
  }

  if (meta.basePoints == null) {
    violations.push({
      severity: "warning",
      field: "basePoints",
      message:
        "Missing basePoints — reward calculation chain cannot be reconstructed.",
    });
  }

  // ── Invariant: pointsBeforeCap ≥ pointsBeforeBonuses ──────────────────────
  if (meta.pointsBeforeCap != null && meta.pointsBeforeBonuses != null) {
    if (meta.pointsBeforeCap < meta.pointsBeforeBonuses - 1) {
      violations.push({
        severity: "warning",
        field: "pointsBeforeCap",
        message:
          `Invariant violation: pointsBeforeCap (${meta.pointsBeforeCap}) < ` +
          `pointsBeforeBonuses (${meta.pointsBeforeBonuses}). ` +
          "This should never happen — pointsBeforeCap includes fixed bonuses.",
        value: {
          pointsBeforeCap: meta.pointsBeforeCap,
          pointsBeforeBonuses: meta.pointsBeforeBonuses,
        },
      });
    }
  }

  // ── Info: unrecognized bonus types ─────────────────────────────────────────
  if (meta.bonusBreakdown) {
    const seen = new Set<string>();
    for (const entry of meta.bonusBreakdown) {
      if (!entry.type || seen.has(entry.type)) continue;
      seen.add(entry.type);
      if (!isKnownBonusType(entry.type)) {
        violations.push({
          severity: "info",
          field: "bonusBreakdown[].type",
          message:
            `Unrecognized bonus type "${entry.type}" — no admin label defined. ` +
            "Add to BONUS_TYPE and BONUS_TYPE_LABELS in lib/rewardConstants.ts.",
          value: entry.type,
        });
      }
    }
  }

  return violations;
}

// ── Health report aggregator ──────────────────────────────────────────────────

/**
 * Aggregates per-transaction violations into a ContractHealthReport.
 * Called by the contractHealth server action after fetching recent transactions.
 */
export function buildContractHealthReport(
  rows: RewardTransactionHealthRow[],
  windowDays: number,
): ContractHealthReport {
  let criticalCount = 0;
  let warningCount = 0;
  let healthyTransactions = 0;
  let missingRideSessionId = 0;
  let missingVerifiedMinutes = 0;
  let missingBasePoints = 0;
  const unrecognizedBonusTypesSet = new Set<string>();
  const unrecognizedSourcesSet = new Set<string>();
  const sampleViolations: ContractHealthReport["sampleViolations"] = [];

  for (const row of rows) {
    const violations = validateRewardMetadata(row.metadata);

    if (row.source && !isKnownRewardSource(row.source)) {
      unrecognizedSourcesSet.add(row.source);
    }

    let hasCritical = false;
    let hasWarning = false;

    for (const v of violations) {
      if (v.severity === "critical") {
        criticalCount++;
        hasCritical = true;
      } else if (v.severity === "warning") {
        warningCount++;
        hasWarning = true;
      }
      if (v.field === "rideSessionId") missingRideSessionId++;
      if (v.field === "verifiedMinutes") missingVerifiedMinutes++;
      if (v.field === "basePoints") missingBasePoints++;
      if (v.field === "bonusBreakdown[].type" && v.value) {
        unrecognizedBonusTypesSet.add(String(v.value));
      }
    }

    if (!hasCritical && !hasWarning) {
      healthyTransactions++;
    }

    if (violations.length > 0 && sampleViolations.length < 5) {
      sampleViolations.push({ transactionId: row.id, violations });
    }
  }

  const total = rows.length;
  const healthScore =
    total === 0 ? 100 : Math.round((healthyTransactions / total) * 100);

  return {
    checkedAt: new Date().toISOString(),
    windowDays,
    totalTransactions: total,
    healthyTransactions,
    healthScore,
    criticalCount,
    warningCount,
    unrecognizedBonusTypes: Array.from(unrecognizedBonusTypesSet),
    unrecognizedSources: Array.from(unrecognizedSourcesSet),
    missingRideSessionId,
    missingVerifiedMinutes,
    missingBasePoints,
    sampleViolations,
  };
}

// ── Dev-mode warning emitter ──────────────────────────────────────────────────

/**
 * Logs contract violations to the console in non-production environments.
 * Safe to call in server actions — no-ops in production.
 */
export function warnContractViolations(
  violations: ContractViolation[],
  context: string,
): void {
  if (process.env.NODE_ENV === "production") return;
  if (violations.length === 0) return;
  const critical = violations.filter((v) => v.severity === "critical");
  const warnings = violations.filter((v) => v.severity === "warning");
  if (critical.length) {
    console.error(
      `[CONTRACT CRITICAL] ${context}:`,
      critical.map((v) => v.message),
    );
  }
  if (warnings.length) {
    console.warn(
      `[CONTRACT WARNING] ${context}:`,
      warnings.map((v) => v.message),
    );
  }
}
