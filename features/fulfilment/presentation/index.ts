/**
 * Fulfilment presentation layer.
 *
 * Domain enums remain the source of truth for APIs and persistence.
 * UI surfaces must resolve display labels, badge colours, and icons here —
 * never render raw snake_case tokens to operators.
 */

export type { BadgeVariant, FulfilmentPresentation } from "./types";
export { humanizeEnumToken } from "./types";

export {
  formatFulfilmentState,
  getFulfilmentStatePresentation,
} from "./states";

export {
  formatFulfilmentType,
  getFulfilmentTypePresentation,
} from "./fulfilmentTypes";

export {
  formatRiderProgress,
  getRiderProgressPresentation,
} from "./progress";
