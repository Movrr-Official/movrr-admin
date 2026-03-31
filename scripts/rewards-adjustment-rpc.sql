-- Atomic rider points adjustment RPC for admin operations.
--
-- Design contract:
--   • reward_transactions has an AFTER INSERT trigger (apply_reward_transaction_to_balance)
--     that updates rider_reward_balance automatically.  The RPC must NOT also do an
--     explicit UPDATE for that path — doing so causes double-counting.
--   • reward_redemptions has no such trigger, so the RPC updates the balance explicitly
--     for the 'redeemed' path.
--   • points_earned is stored SIGNED (positive = credit, negative = debit) so the
--     existing trigger handles both directions correctly.
--   • The balance row is created on first use via INSERT ON CONFLICT DO NOTHING,
--     so callers never need to seed the row manually.
--
-- Run in the Supabase SQL Editor to deploy or update.

create or replace function public.adjust_rider_points_atomic(
  p_rider_id    uuid,
  p_points      integer,
  p_description text    default null,
  p_type        text    default 'adjusted'
)
returns table(success boolean, error_message text, new_balance integer) as $$
declare
  raw_points     integer := coalesce(p_points, 0);
  abs_points     integer := abs(raw_points);
  norm_type      text    := lower(coalesce(p_type, 'adjusted'));
  delta          integer;
  is_debit       boolean;
  balance_row    public.rider_reward_balance;
  result_balance integer;
begin
  -- ── Validation ───────────────────────────────────────────────────────────
  if raw_points = 0 then
    return query select false, 'Points adjustment must be non-zero', null::integer;
    return;
  end if;

  if norm_type not in ('awarded', 'redeemed', 'adjusted') then
    return query select false, 'Invalid adjustment type', null::integer;
    return;
  end if;

  delta    := case when norm_type = 'redeemed' then -abs_points else raw_points end;
  is_debit := delta < 0;

  -- ── Ensure balance row exists ─────────────────────────────────────────────
  -- Creates a zero-balance row on first use; no-ops if the row already exists.
  -- This means callers never need to manually seed rider_reward_balance.
  insert into public.rider_reward_balance (rider_id, points_balance, lifetime_points_earned, updated_at)
  values (p_rider_id, 0, 0, now())
  on conflict (rider_id) do nothing;

  -- ── Lock the row ──────────────────────────────────────────────────────────
  -- Within this transaction the row is now guaranteed to exist.
  select *
  into   balance_row
  from   public.rider_reward_balance
  where  rider_id = p_rider_id
  for update;

  -- ── Overdraft guard ───────────────────────────────────────────────────────
  if is_debit and coalesce(balance_row.points_balance, 0) < abs_points then
    return query select false, 'Insufficient balance for adjustment', null::integer;
    return;
  end if;

  -- ── Write ledger + update balance ─────────────────────────────────────────
  if norm_type = 'redeemed' then
    -- Redemptions go into reward_redemptions, which has no balance trigger.
    -- Update the balance explicitly here.
    insert into public.reward_redemptions (
      rider_id, points_spent, status, requested_at, approved_at, metadata
    ) values (
      p_rider_id,
      abs_points,
      'approved',
      now(),
      now(),
      jsonb_build_object(
        'description', coalesce(p_description, 'Manual redemption'),
        'source',      'admin_manual_adjustment'
      )
    );

    update public.rider_reward_balance
    set
      points_balance = coalesce(points_balance, 0) - abs_points,
      updated_at     = now()
    where rider_id = p_rider_id
    returning points_balance into result_balance;

  else
    -- Credits and debits go into reward_transactions.
    -- The apply_reward_transaction_to_balance trigger fires AFTER this INSERT
    -- and updates rider_reward_balance automatically — no explicit UPDATE here.
    -- Storing delta (signed) lets the trigger handle both directions:
    --   positive  → adds to points_balance and lifetime_points_earned
    --   negative  → subtracts from points_balance, lifetime_points_earned unchanged
    insert into public.reward_transactions (
      rider_id,
      points_earned,
      source,
      metadata,
      created_at
    ) values (
      p_rider_id,
      delta,   -- signed: positive for credits, negative for debits
      case when norm_type = 'awarded' then 'bonus' else 'adjustment' end,
      jsonb_build_object(
        'description',          coalesce(p_description, 'Manual adjustment'),
        'adjustment_direction', case when is_debit then 'debit' else 'credit' end
      ),
      now()
    );

    -- Read the balance that the trigger just wrote.
    select points_balance
    into   result_balance
    from   public.rider_reward_balance
    where  rider_id = p_rider_id;
  end if;

  return query select true, null::text, result_balance;

exception
  when others then
    return query select false, sqlerrm, null::integer;
end;
$$ language plpgsql security definer set search_path = public;

grant execute on function public.adjust_rider_points_atomic(uuid, integer, text, text) to service_role;


-- ── Auto-create balance row on rider insert ───────────────────────────────────
-- Without this, any rider who has never ridden has no rider_reward_balance row
-- and admin adjustments would fail until the mobile app created one naturally.

create or replace function public.create_rider_reward_balance_on_signup()
returns trigger as $$
begin
  insert into public.rider_reward_balance (rider_id, points_balance, lifetime_points_earned, updated_at)
  values (NEW.id, 0, 0, now())
  on conflict (rider_id) do nothing;
  return NEW;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists create_rider_reward_balance_on_signup on public.rider;

create trigger create_rider_reward_balance_on_signup
  after insert on public.rider
  for each row
  execute function public.create_rider_reward_balance_on_signup();
