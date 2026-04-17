-- ============================================================
-- 025_migrate_platform_settings.sql
--
-- Migrates legacy platform_settings rows (system, points,
-- campaignDefaults, featureFlags) to the canonical section
-- keys used by the current admin settings schema.
--
-- Idempotent: ON CONFLICT (key) DO NOTHING means running this
-- twice is safe — existing canonical rows are never overwritten.
--
-- Run BEFORE deploying the code that removes legacy compat.
-- ============================================================

BEGIN;

-- ── 1. Patch existing 'general' row ──────────────────────────
-- The general row was written before maintenanceScope,
-- maintenanceMessage, distanceUnit and co2KgPerKm were added
-- to the schema. Merge missing keys without clobbering values
-- already saved via the admin UI.

UPDATE platform_settings
SET
  value      = value || jsonb_build_object(
    'maintenanceScope',          COALESCE(value->>'maintenanceScope',   'global'),
    'maintenanceMessage',        COALESCE(value->>'maintenanceMessage', 'The platform is temporarily unavailable for maintenance. Please check back shortly.'),
    'distanceUnit',              COALESCE(value->>'distanceUnit',       'km'),
    'co2KgPerKm',                COALESCE((value->>'co2KgPerKm')::numeric, 0.18),
    'publicSupportContactName',  COALESCE(value->>'publicSupportContactName', 'Movrr Support')
  ),
  updated_at = now()
WHERE key = 'general';

-- ── 2. Insert canonical rows derived from legacy data ────────
-- Each INSERT reads from the corresponding legacy row.
-- ON CONFLICT (key) DO NOTHING preserves any row already saved
-- through the current admin UI.

-- rewards  ← points
INSERT INTO platform_settings (key, value, created_at, updated_at)
SELECT
  'rewards',
  jsonb_build_object(
    'basePointsPerMinute',       COALESCE((value->>'basePointsPerMinute')::numeric,  1),
    'dailyCap',                  COALESCE((value->>'dailyCap')::int,                 120),
    'weeklyCap',                 COALESCE((value->>'weeklyCap')::int,                600),
    'campaignMaxRewardCap',      COALESCE((value->>'campaignMaxRewardCap')::int,     1000),
    'minVerifiedMinutes',        COALESCE((value->>'minVerifiedMinutes')::int,       1),
    'standardBikeMultiplier',    1,
    'eBikeMultiplier',           0.9,
    'fatBikeMultiplier',         0.75,
    'boostedRideMultiplier',     1.5,
    'maxAllowedAverageSpeedKmh', 35,
    'maxAllowedPeakSpeedKmh',    45,
    'minMovementDistanceMeters', 150,
    'minMovementGpsPoints',      3
  ),
  now(), now()
FROM platform_settings
WHERE key = 'points'
ON CONFLICT (key) DO NOTHING;

-- campaigns  ← campaignDefaults
INSERT INTO platform_settings (key, value, created_at, updated_at)
SELECT
  'campaigns',
  jsonb_build_object(
    'requireApproval',           COALESCE((value->>'requireApproval')::boolean,    false),
    'defaultMaxRiders',          COALESCE((value->>'defaultMaxRiders')::int,        50),
    'defaultMultiplier',         COALESCE((value->>'defaultMultiplier')::numeric,    1),
    'defaultDurationDays',       COALESCE((value->>'defaultDurationDays')::int,     30),
    'defaultSignupDeadlineDays', COALESCE((value->>'defaultSignupDeadlineDays')::int, 7)
  ),
  now(), now()
FROM platform_settings
WHERE key = 'campaignDefaults'
ON CONFLICT (key) DO NOTHING;

-- features  ← featureFlags  (adds LLM flags, all off by default)
INSERT INTO platform_settings (key, value, created_at, updated_at)
SELECT
  'features',
  jsonb_build_object(
    'rewardsShopEnabled',          COALESCE((value->>'rewardsShopEnabled')::boolean,        true),
    'autoAssignmentEnabled',       COALESCE((value->>'autoAssignmentEnabled')::boolean,     false),
    'routeTemplatesEnabled',       COALESCE((value->>'routeTemplatesEnabled')::boolean,     true),
    'realtimeTrackingEnabled',     COALESCE((value->>'realtimeTrackingEnabled')::boolean,   true),
    'emailNotificationsEnabled',   COALESCE((value->>'emailNotificationsEnabled')::boolean, true),
    'llmGlobalDisable',            true,
    'llmShadowModeEnabled',        false,
    'llmRouteSuggestionsEnabled',  false,
    'llmRouteExplanationsEnabled', false,
    'llmPolicyTranslationEnabled', false
  ),
  now(), now()
FROM platform_settings
WHERE key = 'featureFlags'
ON CONFLICT (key) DO NOTHING;

-- onboarding  ← system.allowSelfSignup
INSERT INTO platform_settings (key, value, created_at, updated_at)
SELECT
  'onboarding',
  jsonb_build_object(
    'riderOnboardingMode',      CASE
                                  WHEN (value->>'allowSelfSignup')::boolean = false
                                  THEN 'waitlist_only'
                                  ELSE 'open'
                                END,
    'requireCity',              true,
    'requireCountry',           true,
    'autoApproveWaitlist',      false,
    'setupEmailEnabled',        true,
    'defaultRiderLanguage',     'en',
    'defaultRiderTimezone',     COALESCE(value->>'timezone', 'Europe/Amsterdam')
  ),
  now(), now()
FROM platform_settings
WHERE key = 'system'
ON CONFLICT (key) DO NOTHING;

-- rideVerification  ← minVerifiedMinutes from points, rest defaults
INSERT INTO platform_settings (key, value, created_at, updated_at)
SELECT
  'rideVerification',
  jsonb_build_object(
    'maxAllowedAverageSpeedKmh', 35,
    'maxAllowedPeakSpeedKmh',    45,
    'minMovementDistanceMeters', 150,
    'minMovementGpsPoints',      3,
    'minVerifiedMinutes',        COALESCE((value->>'minVerifiedMinutes')::int, 1)
  ),
  now(), now()
FROM platform_settings
WHERE key = 'points'
ON CONFLICT (key) DO NOTHING;

-- notifications  ← featureFlags.emailNotificationsEnabled
INSERT INTO platform_settings (key, value, created_at, updated_at)
SELECT
  'notifications',
  jsonb_build_object(
    'operationsEmailEnabled',              COALESCE((value->>'emailNotificationsEnabled')::boolean, true),
    'maintenanceNotificationsEnabled',     true,
    'waitlistNotificationsEnabled',        true,
    'onboardingSetupNotificationsEnabled', true,
    'digestFrequency',                     'daily',
    'alertRouting',                        'support_and_admin',
    'fraudAlertEmail',                     ''
  ),
  now(), now()
FROM platform_settings
WHERE key = 'featureFlags'
ON CONFLICT (key) DO NOTHING;

-- impact  ← defaults (0.18 kg CO₂/km = car-offset methodology)
INSERT INTO platform_settings (key, value, created_at, updated_at)
VALUES (
  'impact',
  '{"distanceUnit":"km","co2KgPerKm":0.18}'::jsonb,
  now(), now()
)
ON CONFLICT (key) DO NOTHING;

-- suggestedRoutes  ← defaults
INSERT INTO platform_settings (key, value, created_at, updated_at)
VALUES (
  'suggestedRoutes',
  '{"standardRideEnabled":true,"defaultMultiplier":1.5,"complianceThreshold":0.7,"maxDailyBonusPoints":300,"maxPerRouteBonusTotal":10000}'::jsonb,
  now(), now()
)
ON CONFLICT (key) DO NOTHING;

-- security  ← defaults
INSERT INTO platform_settings (key, value, created_at, updated_at)
VALUES (
  'security',
  '{"enforceAdminMfa":true,"adminSessionTimeoutMinutes":60,"auditRetentionDays":365,"allowPasswordResetLinks":true,"allowAccountSetupLinks":true,"inviteDomainAllowlist":[]}'::jsonb,
  now(), now()
)
ON CONFLICT (key) DO NOTHING;

-- integrations  ← defaults
INSERT INTO platform_settings (key, value, created_at, updated_at)
VALUES (
  'integrations',
  '{"routeOptimizerDashboardUrl":"","mapsProviderLabel":"MapLibre","mediaCdnBaseUrl":"","webhookStatusPageUrl":""}'::jsonb,
  now(), now()
)
ON CONFLICT (key) DO NOTHING;

-- organization  ← defaults
INSERT INTO platform_settings (key, value, created_at, updated_at)
VALUES (
  'organization',
  '{"displayName":"MOVRR Media","legalCompanyName":"MOVRR Media","supportContactName":"MOVRR Support","billingContactEmail":"","vatId":"","businessAddress":"","brandPrimaryLogoUrl":""}'::jsonb,
  now(), now()
)
ON CONFLICT (key) DO NOTHING;

-- privacy  ← defaults
INSERT INTO platform_settings (key, value, created_at, updated_at)
VALUES (
  'privacy',
  '{"waitlistRetentionDays":180,"auditRetentionVisibilityDays":365,"exportRequestResponseHours":72,"deletionPolicyText":"","privacyContactEmail":"","retentionLastRunAt":null}'::jsonb,
  now(), now()
)
ON CONFLICT (key) DO NOTHING;

-- ── 3. Delete legacy rows ─────────────────────────────────────
-- All data has been promoted to canonical keys above.

DELETE FROM platform_settings
WHERE key IN ('system', 'points', 'campaignDefaults', 'featureFlags');

COMMIT;
