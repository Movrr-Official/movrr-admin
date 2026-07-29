import {
  getSharedFulfilmentModule,
  type FulfilmentModule,
} from "@/features/fulfilment/infrastructure/composeFulfilmentModule";
import type { FulfilmentEngine } from "@/features/fulfilment/application/FulfilmentEngine";

/**
 * Job routes share the same fulfilment engine as Platform API
 * via composeFulfilmentModule singleton.
 */
export function getFulfilmentJobEngine(): FulfilmentEngine {
  return getSharedFulfilmentModule().engine;
}

export function getFulfilmentJobModule(): FulfilmentModule {
  return getSharedFulfilmentModule();
}

/** @deprecated Prefer getFulfilmentJobEngine / getSharedFulfilmentModule */
export function createFulfilmentJobEngine(): FulfilmentEngine {
  return getSharedFulfilmentModule().engine;
}
