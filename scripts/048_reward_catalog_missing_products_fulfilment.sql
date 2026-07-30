-- 048: Cover reward catalog SKUs missed by 047
-- Run in Supabase SQL Editor after 043 + 044 (+ 045 recommended).
-- Safe to re-run. Targets products that still have null fulfilment_type / resource_id
-- (and refreshes tire-kit thumbnail if still on the old bike photo).

BEGIN;

CREATE TEMP TABLE tmp_catalog_fulfilment_seed (
  sku text PRIMARY KEY,
  thumbnail_url text NOT NULL,
  fulfilment_type text NOT NULL,
  resource_kind text NOT NULL,
  resource_id uuid NOT NULL UNIQUE
) ON COMMIT DROP;

INSERT INTO tmp_catalog_fulfilment_seed (
  sku, thumbnail_url, fulfilment_type, resource_kind, resource_id
) VALUES
  -- Missed products from live catalog export
  (
    'MOVRR-HELMET-URBAN-001',
    'https://images.unsplash.com/photo-1554237160-bab09733f443?auto=format&fit=crop&w=800&q=80',
    'physical_collection', 'physical_stock',
    'a0470001-0000-4000-8000-00000000001f'
  ),
  (
    'MOVRR-LIGHTS-USB-002',
    'https://images.pexels.com/photos/100582/pexels-photo-100582.jpeg?auto=compress&cs=tinysrgb&w=800',
    'physical_collection', 'physical_stock',
    'a0470001-0000-4000-8000-000000000020'
  ),
  (
    'MOVRR-KIT-MAINT-003',
    'https://images.unsplash.com/photo-1673870861517-3580d11c2244?auto=format&fit=crop&w=800&q=80',
    'physical_collection', 'physical_stock',
    'a0470001-0000-4000-8000-000000000021'
  ),
  (
    'MOVRR-JACKET-RAIN-004',
    'https://images.unsplash.com/photo-1551028719-00167b16eac5?auto=format&fit=crop&w=800&q=80',
    'physical_shipping', 'physical_stock',
    'a0470001-0000-4000-8000-000000000022'
  ),
  (
    'MOVRR-POWER-TECH-005',
    'https://images.pexels.com/photos/4219861/pexels-photo-4219861.jpeg?auto=compress&cs=tinysrgb&w=800',
    'physical_collection', 'physical_stock',
    'a0470001-0000-4000-8000-000000000023'
  ),
  (
    'MOVRR-BOTTLE-INS-006',
    'https://images.unsplash.com/photo-1602143407151-7111542de6e8?auto=format&fit=crop&w=800&q=80',
    'physical_collection', 'physical_stock',
    'a0470001-0000-4000-8000-000000000024'
  ),
  (
    'MOVRR-GLOVES-WINTER-008',
    'https://images.pexels.com/photos/45057/pexels-photo-45057.jpeg?auto=compress&cs=tinysrgb&w=800',
    'physical_collection', 'physical_stock',
    'a0470001-0000-4000-8000-000000000025'
  ),
  (
    'MOVRR-PHONE-MOUNT-009',
    'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?auto=format&fit=crop&w=800&q=80',
    'physical_collection', 'physical_stock',
    'a0470001-0000-4000-8000-000000000026'
  ),
  -- Refresh tire kit thumbnail (was a full road-bike shot)
  (
    'MOVRR-MAINT-TIREKIT-017',
    'https://images.unsplash.com/photo-1673870861517-3580d11c2244?auto=format&fit=crop&w=800&q=80',
    'physical_collection', 'physical_stock',
    'a0470001-0000-4000-8000-00000000001e'
  );

UPDATE public.reward_catalog AS c
SET
  thumbnail_url = s.thumbnail_url,
  gallery_urls = jsonb_build_array(s.thumbnail_url),
  fulfilment_type = s.fulfilment_type,
  updated_at = now()
FROM tmp_catalog_fulfilment_seed AS s
WHERE c.sku = s.sku;

INSERT INTO public.fulfilment_resource (
  id,
  partner_org_id,
  catalog_item_id,
  resource_kind,
  name,
  status,
  capacity,
  metadata,
  updated_at
)
SELECT
  s.resource_id,
  rp.organisation_id,
  c.id,
  s.resource_kind,
  c.title || ' resource',
  'active',
  CASE
    WHEN c.inventory_type = 'limited' THEN COALESCE(c.inventory_count, 0)
    ELSE 1000
  END,
  jsonb_build_object(
    'sku', c.sku,
    'seeded_by', '048_reward_catalog_missing_products_fulfilment'
  ),
  now()
FROM tmp_catalog_fulfilment_seed AS s
JOIN public.reward_catalog AS c ON c.sku = s.sku
LEFT JOIN public.reward_partner AS rp ON rp.id = c.partner_id
ON CONFLICT (id) DO UPDATE SET
  partner_org_id = COALESCE(EXCLUDED.partner_org_id, public.fulfilment_resource.partner_org_id),
  catalog_item_id = EXCLUDED.catalog_item_id,
  resource_kind = EXCLUDED.resource_kind,
  name = EXCLUDED.name,
  status = 'active',
  capacity = EXCLUDED.capacity,
  metadata = public.fulfilment_resource.metadata || EXCLUDED.metadata,
  updated_at = now();

UPDATE public.reward_catalog AS c
SET
  resource_id = s.resource_id,
  updated_at = now()
FROM tmp_catalog_fulfilment_seed AS s
WHERE c.sku = s.sku;

COMMIT;

-- Optional check:
-- SELECT sku, fulfilment_type, resource_id IS NOT NULL AS has_resource, left(thumbnail_url, 70)
-- FROM reward_catalog
-- WHERE sku IN (
--   'MOVRR-HELMET-URBAN-001','MOVRR-LIGHTS-USB-002','MOVRR-KIT-MAINT-003',
--   'MOVRR-JACKET-RAIN-004','MOVRR-POWER-TECH-005','MOVRR-BOTTLE-INS-006',
--   'MOVRR-GLOVES-WINTER-008','MOVRR-PHONE-MOUNT-009','MOVRR-MAINT-TIREKIT-017'
-- )
-- ORDER BY sku;
