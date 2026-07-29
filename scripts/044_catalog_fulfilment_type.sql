-- Migration 044: Catalog fulfilment_type + resource binding
-- Apply after 043_fulfilment_engine.sql (fulfilment_resource must exist).

-- ---------------------------------------------------------------------------
-- reward_catalog: fulfilment configuration for redeem orchestration
-- ---------------------------------------------------------------------------
ALTER TABLE public.reward_catalog
  ADD COLUMN IF NOT EXISTS fulfilment_type text;

ALTER TABLE public.reward_catalog
  DROP CONSTRAINT IF EXISTS reward_catalog_fulfilment_type_check;

ALTER TABLE public.reward_catalog
  ADD CONSTRAINT reward_catalog_fulfilment_type_check
  CHECK (
    fulfilment_type IS NULL
    OR fulfilment_type IN (
      'instant_digital',
      'qr_barcode',
      'physical_collection',
      'physical_shipping',
      'event_ticket',
      'sweepstakes',
      'donation',
      'premium_feature'
    )
  );

ALTER TABLE public.reward_catalog
  ADD COLUMN IF NOT EXISTS resource_id uuid
    REFERENCES public.fulfilment_resource(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_reward_catalog_fulfilment_type
  ON public.reward_catalog (fulfilment_type)
  WHERE fulfilment_type IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_reward_catalog_resource
  ON public.reward_catalog (resource_id)
  WHERE resource_id IS NOT NULL;

COMMENT ON COLUMN public.reward_catalog.fulfilment_type IS
  'Fulfilment workflow type; Phase 1 redeem supports instant_digital and qr_barcode only.';

COMMENT ON COLUMN public.reward_catalog.resource_id IS
  'Bound FulfilmentResource used when redeeming this catalog item.';
