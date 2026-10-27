/** Canonical source. Mirror with scripts/sync-ride-reward-contract.cjs; no financial writes. */
export const MOVEMENT_VERSION = 'accepted-segments-v1' as const;
/** Ledger-derived diagnostics. available always remains distinct from estimates. */
export type WalletFinancialTotals = {
 version: 3; riderId: string; lifetimeSemantics: 'gross_positive_earnings';
 grossEarned: number; netLedger: number; redeemed: number; reserved: number;
 adjusted: number; refunded: number; reversed: number; available: number;
 snapshotAvailable: number | null; legacyLifetime: number | null; availableReconciled: boolean | null;
};
export type EvidencePoint = { latitude: number; longitude: number; timestamp?: number; accuracy?: number; accepted?: boolean };
export type PauseBoundary = { startedAtMs: number; endedAtMs: number };
export type RewardEstimate = {
  version: 1; points: number | null; confidence: 'valid' | 'limited' | 'unavailable';
  policyVersion: 'legacy-primary-v1' | 'movrr-combined-v3'; movementVersion: typeof MOVEMENT_VERSION;
  basisDigest: string | null; capturedAt: string; exclusions: string[];
};
export function deriveEligibleMovement(points: readonly EvidencePoint[], pauses: readonly PauseBoundary[] = []) {
  let movingTimeMs = 0, distanceM = 0, maxSpeedKmh = 0, acceptedPointCount = 0;
  let integrityReview = false;
  let invalid = pauses.some(p => !Number.isFinite(p.startedAtMs) || !Number.isFinite(p.endedAtMs) || p.endedAtMs < p.startedAtMs);
  let previous: EvidencePoint | null = null;
  for (const point of points) {
    if (point.accepted === false) { previous = null; continue; }
    const valid = Number.isFinite(point.timestamp) && Number.isFinite(point.latitude) && Math.abs(point.latitude) <= 90 && Number.isFinite(point.longitude) && Math.abs(point.longitude) <= 180;
    if (!valid) { previous = null; invalid = true; continue; }
    acceptedPointCount++;
    if (previous) {
      const dt = point.timestamp! - previous.timestamp!;
      if (dt <= 0) invalid = true;
      if (dt > 0 && dt < 60000 && !pauses.some(p => previous!.timestamp! < p.endedAtMs && point.timestamp! > p.startedAtMs)) {
        const rad = Math.PI / 180;
        const a = Math.sin((point.latitude - previous.latitude) * rad / 2) ** 2 + Math.cos(previous.latitude * rad) * Math.cos(point.latitude * rad) * Math.sin((point.longitude - previous.longitude) * rad / 2) ** 2;
        const metres = 6371000 * 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, a))));
        const speed = metres / dt * 3600;
        if (speed > 45) integrityReview = true;
        if (speed > 1.2 && speed <= 45) { movingTimeMs += dt; distanceM += metres; maxSpeedKmh = Math.max(maxSpeedKmh, speed); }
      }
    }
    previous = point;
  }
  return { movingTimeMs, distanceM, maxSpeedKmh, acceptedPointCount, invalid, integrityReview };
}
export function parseRewardEstimate(value: unknown): RewardEstimate | null {
  if (!value || typeof value !== 'object') return null;
  const e = value as RewardEstimate;
  if (e.version !== 1 || !['legacy-primary-v1','movrr-combined-v3'].includes(e.policyVersion) || e.movementVersion !== MOVEMENT_VERSION || !['valid','limited','unavailable'].includes(e.confidence) || !Number.isFinite(Date.parse(e.capturedAt)) || !Array.isArray(e.exclusions) || e.exclusions.some(x => typeof x !== 'string' || !/^[a-z_]+$/.test(x))) return null;
  if (e.confidence === 'unavailable' ? e.points !== null : !Number.isSafeInteger(e.points) || e.points! < 0 || !e.basisDigest || !/^[a-f0-9]{32,64}$/.test(e.basisDigest)) return null;
  return e;
}
export type LifecycleState = 'waiting_upload' | 'verifying' | 'calculating' | 'delayed' | 'review_required' | 'credited' | 'adjusted' | 'not_eligible' | 'unavailable';
export function lifecycleLabel(state: LifecycleState, locale: 'en' | 'nl' = 'en'): string {
  const labels = {
    en: { waiting_upload:'Waiting to upload',verifying:'Verifying ride',calculating:'Calculating points',delayed:'Processing delayed',review_required:'Review required',credited:'Points credited',adjusted:'Points adjusted and credited',not_eligible:'Not eligible for points',unavailable:'Points unavailable' },
    nl: { waiting_upload:'Wachten op upload',verifying:'Rit controleren',calculating:'Punten berekenen',delayed:'Verwerking vertraagd',review_required:'Beoordeling nodig',credited:'Punten toegekend',adjusted:'Punten aangepast en toegekend',not_eligible:'Geen recht op punten',unavailable:'Punten niet beschikbaar' },
  };
  return labels[locale][state];
}
export function rewardLifecycle(input: { status: string; sessionStatus?: string | null; verification?: string | null; awardStatus?: string | null; finalPoints?: number | null; estimatedPoints?: number | null; committedPoints?: number | null; updatedAt?: string | null; reason?: string | null }, nowMs = Date.now()): LifecycleState {
  if (input.status === 'settled' && input.finalPoints != null) {
    if (input.verification === 'rejected' || ['rejected','too_short','insufficient_distance'].includes(input.awardStatus ?? '')) return 'not_eligible';
    return input.estimatedPoints != null && input.estimatedPoints !== input.finalPoints ? 'adjusted' : 'credited';
  }
  if (input.status === 'awaiting_verification' || input.sessionStatus === 'under_review' || input.verification === 'manual_review' || input.awardStatus === 'manual_review' || input.reason) return 'review_required';
  if (input.status === 'completion_pending' || input.status === 'completion_saving') return 'waiting_upload';
  if (input.verification === 'rejected') return 'not_eligible';
  if (input.status === 'unknown') return 'unavailable';
  if (input.status === 'failed' || (input.updatedAt && /^\d{4}-\d{2}-\d{2}T/.test(input.updatedAt) && nowMs - Date.parse(input.updatedAt) > 300000)) return 'delayed';
  return input.verification === 'verified' ? 'calculating' : 'verifying';
}

/** Enroll new sessions only after the durable batch-ack compatibility migration. */
export function supportsRideCompletionV3(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const c = value as Record<string, unknown>;
  return c.version === 3 && c.enabled === true && c.schemaRevision === 99 && c.evidenceAckVersion === 1;
}
