-- 047: Reward catalog thumbnails + fulfilment_type + resource binding
-- Run in Supabase SQL Editor after 043 + 044 (+ 045 recommended for partner_org_id).
-- Safe to re-run: updates by sku, upserts fixed resource UUIDs, seeds voucher pool items once.
--
-- Image URLs were HTTP-checked (200) and curated to match each product.

BEGIN;

-- ---------------------------------------------------------------------------
-- Seed map: sku → thumbnail, fulfilment_type, resource_kind, stable resource id
-- ---------------------------------------------------------------------------
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
  -- Digital / QR vouchers & credits
  (
    'MOVRR-VOUCHER-COFFEE-007',
    'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=800&q=80',
    'qr_barcode', 'voucher_pool',
    'a0470001-0000-4000-8000-000000000001'
  ),
  (
    'MOVRR-VOUCHER-LUNCH-012',
    'https://images.unsplash.com/photo-1540189549336-e6e99c3679fe?auto=format&fit=crop&w=800&q=80',
    'qr_barcode', 'voucher_pool',
    'a0470001-0000-4000-8000-000000000002'
  ),
  (
    'MOVRR-FOOD-SMOOTHIE-003',
    'https://images.unsplash.com/photo-1610970881699-44a5587cabec?auto=format&fit=crop&w=800&q=80',
    'qr_barcode', 'voucher_pool',
    'a0470001-0000-4000-8000-000000000003'
  ),
  (
    'MOVRR-VOUCHER-RIDE-024',
    'https://images.unsplash.com/photo-1489515217757-5fd1be406fef?auto=format&fit=crop&w=800&q=80',
    'instant_digital', 'generated_digital',
    'a0470001-0000-4000-8000-000000000004'
  ),
  (
    'MOVRR-EXP-CINEMA-027',
    'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?auto=format&fit=crop&w=800&q=80',
    'qr_barcode', 'voucher_pool',
    'a0470001-0000-4000-8000-000000000005'
  ),
  (
    'MOVRR-EXP-MUSEUM-028',
    'https://images.unsplash.com/photo-1564399579883-451a5d44ec08?auto=format&fit=crop&w=800&q=80',
    'qr_barcode', 'voucher_pool',
    'a0470001-0000-4000-8000-000000000006'
  ),
  (
    'MOVRR-GROCERY-DIRK-029',
    'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=800&q=80',
    'instant_digital', 'generated_digital',
    'a0470001-0000-4000-8000-000000000007'
  ),
  (
    'MOVRR-GROCERY-PICNIC-030',
    'https://images.unsplash.com/photo-1543168256-418811576931?auto=format&fit=crop&w=800&q=80',
    'instant_digital', 'generated_digital',
    'a0470001-0000-4000-8000-000000000008'
  ),
  (
    'MOVRR-MEALBOX-HELLOFRESH-031',
    'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?auto=format&fit=crop&w=800&q=80',
    'instant_digital', 'generated_digital',
    'a0470001-0000-4000-8000-000000000009'
  ),
  (
    'MOVRR-MEALBOX-FACTOR-032',
    'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=800&q=80',
    'instant_digital', 'generated_digital',
    'a0470001-0000-4000-8000-00000000000a'
  ),
  (
    'MOVRR-MARKET-VVV-033',
    'https://images.unsplash.com/photo-1549465220-1a8b9238cd48?auto=format&fit=crop&w=800&q=80',
    'instant_digital', 'generated_digital',
    'a0470001-0000-4000-8000-00000000000b'
  ),
  (
    'MOVRR-MOBILITY-OV-034',
    'https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?auto=format&fit=crop&w=800&q=80',
    'instant_digital', 'generated_digital',
    'a0470001-0000-4000-8000-00000000000c'
  ),

  -- Food / drink physical or partner pickup
  (
    'MOVRR-FOOD-BAKERY-014',
    'https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=800&q=80',
    'physical_collection', 'physical_stock',
    'a0470001-0000-4000-8000-00000000000d'
  ),
  (
    'MOVRR-FOOD-TEA-025',
    'https://images.unsplash.com/photo-1576092768241-dec231879fc3?auto=format&fit=crop&w=800&q=80',
    'physical_collection', 'physical_stock',
    'a0470001-0000-4000-8000-00000000000e'
  ),

  -- Fashion / apparel
  (
    'MOVRR-FASHION-TEE-021',
    'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&w=800&q=80',
    'physical_collection', 'physical_stock',
    'a0470001-0000-4000-8000-00000000000f'
  ),
  (
    'MOVRR-FASHION-SNEAKER-008',
    'https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=800&q=80',
    'physical_shipping', 'physical_stock',
    'a0470001-0000-4000-8000-000000000010'
  ),
  (
    'MOVRR-FASHION-JACKET-026',
    'https://images.unsplash.com/photo-1544022613-e87ca75a784a?auto=format&fit=crop&w=800&q=80',
    'physical_shipping', 'physical_stock',
    'a0470001-0000-4000-8000-000000000011'
  ),

  -- Electronics / accessories
  (
    'MOVRR-ELEC-EARBUDS-005',
    'https://images.unsplash.com/photo-1572569511254-d8f925fe2cbb?auto=format&fit=crop&w=800&q=80',
    'physical_shipping', 'physical_stock',
    'a0470001-0000-4000-8000-000000000012'
  ),
  (
    'MOVRR-ELEC-POWERBANK-018',
    'https://images.pexels.com/photos/4219861/pexels-photo-4219861.jpeg?auto=compress&cs=tinysrgb&w=800',
    'physical_collection', 'physical_stock',
    'a0470001-0000-4000-8000-000000000013'
  ),
  (
    'MOVRR-ELEC-SMARTLIGHT-023',
    'https://images.pexels.com/photos/100582/pexels-photo-100582.jpeg?auto=compress&cs=tinysrgb&w=800',
    'physical_collection', 'physical_stock',
    'a0470001-0000-4000-8000-000000000014'
  ),
  (
    'MOVRR-ACC-PHONEMOUNT-006',
    'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?auto=format&fit=crop&w=800&q=80',
    'physical_collection', 'physical_stock',
    'a0470001-0000-4000-8000-000000000015'
  ),
  (
    'MOVRR-ACC-BOTTLE-020',
    'https://images.unsplash.com/photo-1602143407151-7111542de6e8?auto=format&fit=crop&w=800&q=80',
    'physical_collection', 'physical_stock',
    'a0470001-0000-4000-8000-000000000016'
  ),

  -- Health / beauty / stays / experiences (appointment-style)
  (
    'MOVRR-HEALTH-SKINCARE-010',
    'https://images.unsplash.com/photo-1556228578-0d85b1a4d571?auto=format&fit=crop&w=800&q=80',
    'physical_shipping', 'physical_stock',
    'a0470001-0000-4000-8000-000000000017'
  ),
  (
    'MOVRR-HEALTH-MASSAGE-022',
    'https://images.unsplash.com/photo-1544161515-4ab6ce6db874?auto=format&fit=crop&w=800&q=80',
    'event_ticket', 'event_allocation',
    'a0470001-0000-4000-8000-000000000018'
  ),
  (
    'MOVRR-STAYS-BOUTIQUE-011',
    'https://images.unsplash.com/photo-1611892440504-42a792e24d32?auto=format&fit=crop&w=800&q=80',
    'event_ticket', 'event_allocation',
    'a0470001-0000-4000-8000-000000000019'
  ),
  (
    'MOVRR-STAYS-HOSTEL-019',
    'https://images.unsplash.com/photo-1555854877-bab0e564b8d5?auto=format&fit=crop&w=800&q=80',
    'event_ticket', 'event_allocation',
    'a0470001-0000-4000-8000-00000000001a'
  ),

  -- Safety / maintenance
  (
    'MOVRR-SAFETY-HELMET-004',
    'https://images.unsplash.com/photo-1554237160-bab09733f443?auto=format&fit=crop&w=800&q=80',
    'physical_collection', 'physical_stock',
    'a0470001-0000-4000-8000-00000000001b'
  ),
  (
    'MOVRR-SAFETY-VEST-013',
    'https://images.pexels.com/photos/585419/pexels-photo-585419.jpeg?auto=compress&cs=tinysrgb&w=800',
    'physical_collection', 'physical_stock',
    'a0470001-0000-4000-8000-00000000001c'
  ),
  (
    'MOVRR-MAINT-TUNEUP-016',
    'https://images.unsplash.com/photo-1485965120184-e220f721d03e?auto=format&fit=crop&w=800&q=80',
    'physical_collection', 'partner_capacity',
    'a0470001-0000-4000-8000-00000000001d'
  ),
  (
    'MOVRR-MAINT-TIREKIT-017',
    'https://images.unsplash.com/photo-1673870861517-3580d11c2244?auto=format&fit=crop&w=800&q=80',
    'physical_collection', 'physical_stock',
    'a0470001-0000-4000-8000-00000000001e'
  );

-- ---------------------------------------------------------------------------
-- 1) Thumbnails + fulfilment_type
-- ---------------------------------------------------------------------------
UPDATE public.reward_catalog AS c
SET
  thumbnail_url = s.thumbnail_url,
  gallery_urls = jsonb_build_array(s.thumbnail_url),
  fulfilment_type = s.fulfilment_type,
  updated_at = now()
FROM tmp_catalog_fulfilment_seed AS s
WHERE c.sku = s.sku;

-- ---------------------------------------------------------------------------
-- 2) Upsert fulfilment_resource rows (stable ids) and bind catalog.resource_id
-- ---------------------------------------------------------------------------
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
    'seeded_by', '047_reward_catalog_images_and_fulfilment'
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

-- ---------------------------------------------------------------------------
-- 3) Seed a small voucher pool for qr_barcode products (once per resource)
-- ---------------------------------------------------------------------------
INSERT INTO public.fulfilment_resource_item (
  resource_id,
  external_code_hash,
  display_payload,
  status
)
SELECT
  s.resource_id,
  md5(s.sku || ':' || g.n::text),
  jsonb_build_object(
    'code', 'MOVRR-DEMO-' || upper(substr(md5(s.sku || g.n::text), 1, 10)),
    'sku', s.sku,
    'seeded', true
  ),
  'available'
FROM tmp_catalog_fulfilment_seed AS s
CROSS JOIN generate_series(1, 5) AS g(n)
WHERE s.resource_kind = 'voucher_pool'
  AND NOT EXISTS (
    SELECT 1
    FROM public.fulfilment_resource_item AS i
    WHERE i.resource_id = s.resource_id
  );

COMMIT;

-- Quick verification (optional; safe to re-run separately)
-- SELECT sku, fulfilment_type, resource_id, left(thumbnail_url, 60) AS thumb
-- FROM public.reward_catalog
-- WHERE sku LIKE 'MOVRR-%'
-- ORDER BY sku;
