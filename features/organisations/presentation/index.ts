/**
 * Organisation presentation layer.
 *
 * Domain enums remain the source of truth for APIs and persistence.
 * UI surfaces must resolve display labels and badge colours here —
 * never render raw snake_case tokens to operators.
 */

export type { BadgeVariant, OrganisationPresentation } from "./types";
export { humanizeEnumToken } from "./types";

export {
  formatOrganisationType,
  getOrganisationTypePresentation,
} from "./organisationTypes";

export {
  formatOrganisationStatus,
  getOrganisationStatusPresentation,
} from "./organisationStatuses";

export {
  formatMembershipRole,
  getMembershipRolePresentation,
} from "./membershipRoles";

export {
  formatBundleKey,
  formatMembershipStatus,
  getMembershipStatusPresentation,
} from "./membershipStatuses";

export {
  assessPartnerReadiness,
  computePartnerFleetKpis,
  formatPartnerReadiness,
  getPartnerReadinessPresentation,
  readinessSortRank,
  type PartnerFleetKpis,
  type PartnerReadiness,
  type PartnerReadinessAssessment,
} from "./partnerReadiness";

export {
  computeOrganisationDirectoryKpis,
  type OrganisationDirectoryKpis,
} from "./organisationDirectory";
