-- Reward catalog schema for rider rewards shop
create table if not exists public.reward_partner (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  website text,
  logo_url text,
  contact_email text,
  status text not null default 'active',
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create table if not exists public.reward_catalog (
  id uuid primary key default gen_random_uuid(),
  sku text not null unique,
  title text not null,
  description text,
  category text not null,
  status text not null default 'draft',
  points_price integer not null check (points_price >= 0),
  partner_id uuid references public.reward_partner(id) on delete set null,
  partner_url text,
  thumbnail_url text,
  gallery_urls jsonb not null default '[]'::jsonb,
  inventory_type text not null default 'unlimited',
  inventory_count integer,
  max_per_rider integer,
  featured_rank integer,
  is_featured boolean not null default false,
  visibility_rules jsonb not null default '{}'::jsonb,
  tags text[] not null default '{}',
  published_at timestamp with time zone,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create table if not exists public.reward_catalog_sync_log (
  id uuid primary key default gen_random_uuid(),
  reward_id uuid references public.reward_catalog(id) on delete cascade,
  sync_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamp with time zone not null default now()
);

create table if not exists public.reward_redemptions (
  id uuid primary key default gen_random_uuid(),
  rider_id uuid not null references public.rider(id) on delete cascade,
  reward_id uuid references public.reward_catalog(id) on delete set null,
  reward_sku text,
  reward_title text,
  points_spent integer not null check (points_spent >= 0),
  status text not null default 'requested'
    check (status in ('requested', 'approved', 'issued', 'fulfilled', 'cancelled', 'rejected')),
  requested_at timestamp with time zone not null default now(),
  approved_at timestamp with time zone,
  issued_at timestamp with time zone,
  fulfilled_at timestamp with time zone,
  cancelled_at timestamp with time zone,
  rejection_reason text,
  voucher_code text,
  voucher_url text,
  fulfillment_notes text,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists idx_reward_catalog_status on public.reward_catalog (status);
create index if not exists idx_reward_catalog_category on public.reward_catalog (category);
create index if not exists idx_reward_catalog_featured on public.reward_catalog (is_featured, featured_rank);
create index if not exists idx_reward_catalog_partner on public.reward_catalog (partner_id);

create index if not exists idx_reward_redemptions_rider_id on public.reward_redemptions (rider_id);
create index if not exists idx_reward_redemptions_reward_id on public.reward_redemptions (reward_id);
create index if not exists idx_reward_redemptions_status on public.reward_redemptions (status);
create index if not exists idx_reward_redemptions_requested_at on public.reward_redemptions (requested_at desc);

alter table public.reward_catalog enable row level security;
alter table public.reward_redemptions enable row level security;

-- Public read access to active catalog items
DROP POLICY IF EXISTS "Public read active rewards" ON public.reward_catalog;

CREATE POLICY "Public read active rewards"
  ON public.reward_catalog
  FOR SELECT
  TO PUBLIC
  USING (status = 'active');

DROP POLICY IF EXISTS "Riders can view own reward redemptions" ON public.reward_redemptions;
CREATE POLICY "Riders can view own reward redemptions"
  ON public.reward_redemptions
  FOR SELECT
  USING (auth.uid() = rider_id);

-- Admin management (service role bypasses RLS)

-- Redemption RPC (atomic redemption + optional inventory decrement)
create or replace function public.redeem_reward_product(
  p_rider_id uuid,
  p_reward_id uuid
)
returns table(status text, points_spent integer, redemption_id uuid) as $$
declare
  catalog_row public.reward_catalog;
  balance_row public.rider_reward_balance;
  redemption_id uuid;
  existing_redemptions integer := 0;
begin
  select * into catalog_row from public.reward_catalog where id = p_reward_id;
  if catalog_row.id is null or catalog_row.status <> 'active' then
    return query select 'not_available', 0, null;
  end if;

  select * into balance_row from public.rider_reward_balance where rider_id = p_rider_id for update;
  if balance_row.rider_id is null then
    return query select 'no_balance', 0, null;
  end if;

  if catalog_row.max_per_rider is not null then
    select count(*) into existing_redemptions
    from public.reward_redemptions
    where rider_id = p_rider_id
      and reward_id = catalog_row.id
      and status not in ('cancelled', 'rejected');

    if existing_redemptions >= catalog_row.max_per_rider then
      return query select 'not_available', 0, null;
    end if;
  end if;

  if balance_row.points_balance < catalog_row.points_price then
    return query select 'insufficient_points', catalog_row.points_price, null;
  end if;

  if catalog_row.inventory_type = 'limited' then
    if catalog_row.inventory_count is null or catalog_row.inventory_count <= 0 then
      return query select 'out_of_stock', 0, null;
    end if;
    update public.reward_catalog
      set inventory_count = catalog_row.inventory_count - 1,
          updated_at = now()
      where id = catalog_row.id;
  end if;

  insert into public.reward_redemptions (
    rider_id,
    reward_id,
    reward_sku,
    reward_title,
    points_spent,
    status,
    requested_at,
    metadata
  ) values (
    p_rider_id,
    catalog_row.id,
    catalog_row.sku,
    catalog_row.title,
    catalog_row.points_price,
    'requested',
    now(),
    jsonb_build_object('reward_id', catalog_row.id, 'reward_title', catalog_row.title)
  ) returning id into redemption_id;

  insert into public.reward_transactions (
    rider_id,
    campaign_id,
    ride_id,
    points_earned,
    source,
    metadata,
    created_at
  ) values (
    p_rider_id,
    null,
    null,
    -catalog_row.points_price,
    'redemption',
    jsonb_build_object(
      'reward_id', catalog_row.id,
      'reward_title', catalog_row.title,
      'reward_sku', catalog_row.sku,
      'campaignName', catalog_row.title
    ),
    now()
  );

  return query select 'ok', catalog_row.points_price, redemption_id;
end;
$$ language plpgsql security definer;
