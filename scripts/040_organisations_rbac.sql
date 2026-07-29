-- Migration 040: Organisations tenancy + membership + permission-bundle RBAC
-- Apply after reward-catalog.sql (reward_partner must exist for backfill).

-- ---------------------------------------------------------------------------
-- Organisations (multi-tenant root)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.organisation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  type text NOT NULL
    CHECK (type IN ('reward_partner', 'advertiser', 'government', 'movrr')),
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inactive', 'suspended')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_organisation_type
  ON public.organisation (type);

CREATE INDEX IF NOT EXISTS idx_organisation_status
  ON public.organisation (status);

-- ---------------------------------------------------------------------------
-- Permission bundles (capabilities live on bundles, not role enums)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.permission_bundle (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.bundle_capability (
  bundle_id uuid NOT NULL REFERENCES public.permission_bundle(id) ON DELETE CASCADE,
  capability text NOT NULL,
  PRIMARY KEY (bundle_id, capability)
);

CREATE INDEX IF NOT EXISTS idx_bundle_capability_capability
  ON public.bundle_capability (capability);

-- ---------------------------------------------------------------------------
-- Organisation memberships
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.organisation_membership (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES public.organisation(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL
    CHECK (role IN ('owner', 'manager', 'staff', 'viewer')),
  bundle_key text NOT NULL REFERENCES public.permission_bundle(key),
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'invited', 'revoked')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organisation_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_organisation_membership_user
  ON public.organisation_membership (user_id)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_organisation_membership_org
  ON public.organisation_membership (organisation_id);

-- ---------------------------------------------------------------------------
-- Seed default permission bundles + capabilities
-- ---------------------------------------------------------------------------
INSERT INTO public.permission_bundle (key, name, description)
VALUES
  ('org.owner', 'Organisation Owner', 'Full partner workspace administration'),
  ('org.manager', 'Organisation Manager', 'Operational management without staff admin'),
  ('org.staff', 'Organisation Staff', 'Validate / confirm fulfilment operations'),
  ('org.viewer', 'Organisation Viewer', 'Read-only partner workspace access'),
  ('rider.default', 'Rider Default', 'Rider redeem / read capabilities')
ON CONFLICT (key) DO NOTHING;

-- org.owner
INSERT INTO public.bundle_capability (bundle_id, capability)
SELECT b.id, c.capability
FROM public.permission_bundle b
CROSS JOIN (
  VALUES
    ('staff.manage'),
    ('resources.manage'),
    ('rewards.manage'),
    ('rewards.catalog.read'),
    ('fulfilment.validate'),
    ('fulfilment.confirm'),
    ('fulfilment.read'),
    ('fulfilment.cancel'),
    ('fulfilment.refund'),
    ('analytics.view')
) AS c(capability)
WHERE b.key = 'org.owner'
ON CONFLICT DO NOTHING;

-- org.manager
INSERT INTO public.bundle_capability (bundle_id, capability)
SELECT b.id, c.capability
FROM public.permission_bundle b
CROSS JOIN (
  VALUES
    ('resources.manage'),
    ('rewards.manage'),
    ('rewards.catalog.read'),
    ('fulfilment.validate'),
    ('fulfilment.confirm'),
    ('fulfilment.read'),
    ('fulfilment.cancel'),
    ('fulfilment.refund'),
    ('analytics.view')
) AS c(capability)
WHERE b.key = 'org.manager'
ON CONFLICT DO NOTHING;

-- org.staff
INSERT INTO public.bundle_capability (bundle_id, capability)
SELECT b.id, c.capability
FROM public.permission_bundle b
CROSS JOIN (
  VALUES
    ('fulfilment.validate'),
    ('fulfilment.confirm'),
    ('fulfilment.read'),
    ('analytics.view'),
    ('rewards.catalog.read')
) AS c(capability)
WHERE b.key = 'org.staff'
ON CONFLICT DO NOTHING;

-- org.viewer
INSERT INTO public.bundle_capability (bundle_id, capability)
SELECT b.id, c.capability
FROM public.permission_bundle b
CROSS JOIN (
  VALUES
    ('fulfilment.read'),
    ('analytics.view'),
    ('rewards.catalog.read')
) AS c(capability)
WHERE b.key = 'org.viewer'
ON CONFLICT DO NOTHING;

-- rider.default
INSERT INTO public.bundle_capability (bundle_id, capability)
SELECT b.id, c.capability
FROM public.permission_bundle b
CROSS JOIN (
  VALUES
    ('rewards.redeem'),
    ('rewards.catalog.read'),
    ('fulfilment.read'),
    ('wallet.read')
) AS c(capability)
WHERE b.key = 'rider.default'
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- Link reward_partner profile → Organisation (tenancy root)
-- ---------------------------------------------------------------------------
ALTER TABLE public.reward_partner
  ADD COLUMN IF NOT EXISTS organisation_id uuid
    REFERENCES public.organisation(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_reward_partner_organisation_id
  ON public.reward_partner (organisation_id)
  WHERE organisation_id IS NOT NULL;

-- Backfill: one Organisation per existing reward_partner (type = reward_partner)
INSERT INTO public.organisation (id, name, type, status, created_at, updated_at)
SELECT
  gen_random_uuid(),
  rp.name,
  'reward_partner',
  CASE
    WHEN lower(coalesce(rp.status, 'active')) = 'active' THEN 'active'
    ELSE 'inactive'
  END,
  coalesce(rp.created_at, now()),
  coalesce(rp.updated_at, now())
FROM public.reward_partner rp
WHERE rp.organisation_id IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.organisation o
    WHERE o.type = 'reward_partner'
      AND o.name = rp.name
  );

UPDATE public.reward_partner rp
SET organisation_id = o.id
FROM public.organisation o
WHERE rp.organisation_id IS NULL
  AND o.type = 'reward_partner'
  AND o.name = rp.name;

-- ---------------------------------------------------------------------------
-- RLS (service-role / dashboard admin paths; membership self-read)
-- ---------------------------------------------------------------------------
ALTER TABLE public.organisation ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permission_bundle ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bundle_capability ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organisation_membership ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Dashboard admins manage organisations" ON public.organisation;
CREATE POLICY "Dashboard admins manage organisations"
  ON public.organisation
  FOR ALL
  USING (public.is_dashboard_admin())
  WITH CHECK (public.is_dashboard_admin());

DROP POLICY IF EXISTS "Members can read own organisation" ON public.organisation;
CREATE POLICY "Members can read own organisation"
  ON public.organisation
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.organisation_membership m
      WHERE m.organisation_id = organisation.id
        AND m.user_id = auth.uid()
        AND m.status = 'active'
    )
  );

DROP POLICY IF EXISTS "Authenticated read permission bundles" ON public.permission_bundle;
CREATE POLICY "Authenticated read permission bundles"
  ON public.permission_bundle
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Dashboard admins manage permission bundles" ON public.permission_bundle;
CREATE POLICY "Dashboard admins manage permission bundles"
  ON public.permission_bundle
  FOR ALL
  USING (public.is_dashboard_admin())
  WITH CHECK (public.is_dashboard_admin());

DROP POLICY IF EXISTS "Authenticated read bundle capabilities" ON public.bundle_capability;
CREATE POLICY "Authenticated read bundle capabilities"
  ON public.bundle_capability
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Dashboard admins manage bundle capabilities" ON public.bundle_capability;
CREATE POLICY "Dashboard admins manage bundle capabilities"
  ON public.bundle_capability
  FOR ALL
  USING (public.is_dashboard_admin())
  WITH CHECK (public.is_dashboard_admin());

DROP POLICY IF EXISTS "Dashboard admins manage memberships" ON public.organisation_membership;
CREATE POLICY "Dashboard admins manage memberships"
  ON public.organisation_membership
  FOR ALL
  USING (public.is_dashboard_admin())
  WITH CHECK (public.is_dashboard_admin());

DROP POLICY IF EXISTS "Members can read own memberships" ON public.organisation_membership;
CREATE POLICY "Members can read own memberships"
  ON public.organisation_membership
  FOR SELECT
  USING (user_id = auth.uid());
