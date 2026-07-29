-- Migration 043: Fulfilment engine schema
-- Aggregates: fulfilment (+ events, tokens, resources, allocations, partner_validation)
-- Optimistic concurrency via fulfilment.version

-- ---------------------------------------------------------------------------
-- Fulfilment (authoritative operational record; 1:1 with redemption)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.fulfilment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  redemption_id uuid NOT NULL UNIQUE
    REFERENCES public.reward_redemptions(id) ON DELETE RESTRICT,
  rider_id uuid NOT NULL REFERENCES public.rider(id) ON DELETE RESTRICT,
  catalog_item_id uuid NOT NULL
    REFERENCES public.reward_catalog(id) ON DELETE RESTRICT,
  fulfilment_type text NOT NULL
    CHECK (fulfilment_type IN (
      'instant_digital',
      'qr_barcode',
      'physical_collection',
      'physical_shipping',
      'event_ticket',
      'sweepstakes',
      'donation',
      'premium_feature'
    )),
  state text NOT NULL DEFAULT 'created'
    CHECK (state IN (
      'created',
      'reserved',
      'processing',
      'ready',
      'awaiting_collection',
      'collected',
      'dispatched',
      'delivered',
      'validated',
      'completed',
      'cancelled',
      'failed',
      'expired',
      'refunded',
      'reversed'
    )),
  outcome text
    CHECK (
      outcome IS NULL
      OR outcome IN (
        'success',
        'cancelled',
        'failed',
        'expired',
        'refunded',
        'reversed'
      )
    ),
  version integer NOT NULL DEFAULT 0 CHECK (version >= 0),
  partner_org_id uuid REFERENCES public.organisation(id) ON DELETE SET NULL,
  idempotency_key text NOT NULL,
  expires_at timestamptz,
  completed_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_fulfilment_rider
  ON public.fulfilment (rider_id);

CREATE INDEX IF NOT EXISTS idx_fulfilment_state
  ON public.fulfilment (state);

CREATE INDEX IF NOT EXISTS idx_fulfilment_type
  ON public.fulfilment (fulfilment_type);

CREATE INDEX IF NOT EXISTS idx_fulfilment_partner_org
  ON public.fulfilment (partner_org_id)
  WHERE partner_org_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_fulfilment_expires
  ON public.fulfilment (expires_at)
  WHERE expires_at IS NOT NULL AND state NOT IN (
    'completed', 'cancelled', 'failed', 'expired', 'refunded', 'reversed'
  );

-- ---------------------------------------------------------------------------
-- FulfilmentEvent (append-only canonical timeline)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.fulfilment_event (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fulfilment_id uuid NOT NULL
    REFERENCES public.fulfilment(id) ON DELETE CASCADE,
  from_state text NOT NULL,
  to_state text NOT NULL,
  reason text,
  correlation_id text,
  actor_user_id uuid,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fulfilment_event_fulfilment
  ON public.fulfilment_event (fulfilment_id, occurred_at);

CREATE OR REPLACE FUNCTION public.forbid_fulfilment_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'fulfilment_event is append-only';
END;
$$;

DROP TRIGGER IF EXISTS trg_fulfilment_event_no_update ON public.fulfilment_event;
CREATE TRIGGER trg_fulfilment_event_no_update
  BEFORE UPDATE ON public.fulfilment_event
  FOR EACH ROW
  EXECUTE FUNCTION public.forbid_fulfilment_event_mutation();

DROP TRIGGER IF EXISTS trg_fulfilment_event_no_delete ON public.fulfilment_event;
CREATE TRIGGER trg_fulfilment_event_no_delete
  BEFORE DELETE ON public.fulfilment_event
  FOR EACH ROW
  EXECUTE FUNCTION public.forbid_fulfilment_event_mutation();

-- ---------------------------------------------------------------------------
-- FulfilmentToken
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.fulfilment_token (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fulfilment_id uuid NOT NULL
    REFERENCES public.fulfilment(id) ON DELETE CASCADE,
  token_type text NOT NULL
    CHECK (token_type IN (
      'qr',
      'barcode',
      'one_time_code',
      'deep_link',
      'short_code',
      'nfc'
    )),
  token_hash text NOT NULL,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'consumed', 'revoked', 'expired')),
  expires_at timestamptz,
  consumed_at timestamptz,
  revoked_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (token_hash)
);

CREATE INDEX IF NOT EXISTS idx_fulfilment_token_fulfilment
  ON public.fulfilment_token (fulfilment_id);

CREATE INDEX IF NOT EXISTS idx_fulfilment_token_status
  ON public.fulfilment_token (status)
  WHERE status = 'active';

-- ---------------------------------------------------------------------------
-- FulfilmentResource (generalised inventory definition)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.fulfilment_resource (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_org_id uuid REFERENCES public.organisation(id) ON DELETE SET NULL,
  catalog_item_id uuid REFERENCES public.reward_catalog(id) ON DELETE SET NULL,
  resource_kind text NOT NULL
    CHECK (resource_kind IN (
      'voucher_pool',
      'generated_digital',
      'physical_stock',
      'event_allocation',
      'partner_capacity'
    )),
  name text NOT NULL,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inactive', 'exhausted')),
  capacity integer CHECK (capacity IS NULL OR capacity >= 0),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fulfilment_resource_partner
  ON public.fulfilment_resource (partner_org_id);

CREATE INDEX IF NOT EXISTS idx_fulfilment_resource_catalog
  ON public.fulfilment_resource (catalog_item_id);

-- ---------------------------------------------------------------------------
-- FulfilmentResourceItem (pool serials / codes)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.fulfilment_resource_item (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_id uuid NOT NULL
    REFERENCES public.fulfilment_resource(id) ON DELETE CASCADE,
  external_code_hash text,
  display_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'available'
    CHECK (status IN ('available', 'reserved', 'fulfilled', 'released')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fulfilment_resource_item_resource_status
  ON public.fulfilment_resource_item (resource_id, status);

-- ---------------------------------------------------------------------------
-- FulfilmentResourceAllocation
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.fulfilment_resource_allocation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fulfilment_id uuid NOT NULL
    REFERENCES public.fulfilment(id) ON DELETE CASCADE,
  resource_id uuid NOT NULL
    REFERENCES public.fulfilment_resource(id) ON DELETE RESTRICT,
  resource_item_id uuid
    REFERENCES public.fulfilment_resource_item(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'reserved'
    CHECK (status IN ('available', 'reserved', 'fulfilled', 'released')),
  allocated_at timestamptz NOT NULL DEFAULT now(),
  released_at timestamptz,
  fulfilled_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (fulfilment_id, resource_id)
);

CREATE INDEX IF NOT EXISTS idx_fulfilment_resource_allocation_fulfilment
  ON public.fulfilment_resource_allocation (fulfilment_id);

CREATE INDEX IF NOT EXISTS idx_fulfilment_resource_allocation_item
  ON public.fulfilment_resource_allocation (resource_item_id)
  WHERE resource_item_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- PartnerValidation (partner interaction log)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.partner_validation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fulfilment_id uuid NOT NULL
    REFERENCES public.fulfilment(id) ON DELETE CASCADE,
  partner_org_id uuid
    REFERENCES public.organisation(id) ON DELETE SET NULL,
  actor_user_id uuid,
  action text NOT NULL
    CHECK (action IN (
      'validate',
      'confirm_collection',
      'manual_override',
      'reject',
      'failure'
    )),
  decision text
    CHECK (
      decision IS NULL
      OR decision IN ('accepted', 'rejected', 'inconclusive')
    ),
  device_context jsonb NOT NULL DEFAULT '{}'::jsonb,
  reason text,
  correlation_id text,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_partner_validation_fulfilment
  ON public.partner_validation (fulfilment_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_partner_validation_org
  ON public.partner_validation (partner_org_id, occurred_at DESC);

-- ---------------------------------------------------------------------------
-- RLS — platform service / dashboard admin; riders read own fulfilments
-- ---------------------------------------------------------------------------
ALTER TABLE public.fulfilment ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fulfilment_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fulfilment_token ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fulfilment_resource ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fulfilment_resource_item ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fulfilment_resource_allocation ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_validation ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Dashboard admins manage fulfilment" ON public.fulfilment;
CREATE POLICY "Dashboard admins manage fulfilment"
  ON public.fulfilment
  FOR ALL
  USING (public.is_dashboard_admin())
  WITH CHECK (public.is_dashboard_admin());

DROP POLICY IF EXISTS "Riders read own fulfilment" ON public.fulfilment;
CREATE POLICY "Riders read own fulfilment"
  ON public.fulfilment
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.rider r
      WHERE r.id = fulfilment.rider_id
        AND r.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Dashboard admins manage fulfilment events"
  ON public.fulfilment_event;
CREATE POLICY "Dashboard admins manage fulfilment events"
  ON public.fulfilment_event
  FOR ALL
  USING (public.is_dashboard_admin())
  WITH CHECK (public.is_dashboard_admin());

DROP POLICY IF EXISTS "Dashboard admins manage fulfilment tokens"
  ON public.fulfilment_token;
CREATE POLICY "Dashboard admins manage fulfilment tokens"
  ON public.fulfilment_token
  FOR ALL
  USING (public.is_dashboard_admin())
  WITH CHECK (public.is_dashboard_admin());

DROP POLICY IF EXISTS "Dashboard admins manage fulfilment resources"
  ON public.fulfilment_resource;
CREATE POLICY "Dashboard admins manage fulfilment resources"
  ON public.fulfilment_resource
  FOR ALL
  USING (public.is_dashboard_admin())
  WITH CHECK (public.is_dashboard_admin());

DROP POLICY IF EXISTS "Dashboard admins manage fulfilment resource items"
  ON public.fulfilment_resource_item;
CREATE POLICY "Dashboard admins manage fulfilment resource items"
  ON public.fulfilment_resource_item
  FOR ALL
  USING (public.is_dashboard_admin())
  WITH CHECK (public.is_dashboard_admin());

DROP POLICY IF EXISTS "Dashboard admins manage fulfilment allocations"
  ON public.fulfilment_resource_allocation;
CREATE POLICY "Dashboard admins manage fulfilment allocations"
  ON public.fulfilment_resource_allocation
  FOR ALL
  USING (public.is_dashboard_admin())
  WITH CHECK (public.is_dashboard_admin());

DROP POLICY IF EXISTS "Dashboard admins manage partner validation"
  ON public.partner_validation;
CREATE POLICY "Dashboard admins manage partner validation"
  ON public.partner_validation
  FOR ALL
  USING (public.is_dashboard_admin())
  WITH CHECK (public.is_dashboard_admin());
