"use client";

import { track } from "@vercel/analytics";
import { logger } from "@/lib/logger";

type OpsEventProps = Record<string, string | number | boolean | null>;

/**
 * Operational product telemetry for Partner Operations / Organisations.
 * Reuses Vercel Analytics (already mounted in root layout) + structured logger.
 * Does not introduce a second analytics platform.
 */
export function trackOpsEvent(name: string, props?: OpsEventProps): void {
  try {
    track(name, props);
  } catch {
    // Analytics must never break operator workflows.
  }
  logger.info(`ops.event.${name}`, props ?? {});
}
