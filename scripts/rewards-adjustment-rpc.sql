-- Atomic rider points adjustment RPC for admin operations.
-- This function keeps balance updates and ledger writes in a single DB transaction.
create or replace function public.adjust_rider_points_atomic(
  p_rider_id uuid,
  p_points integer,
  p_description text default null,
  p_type text default 'adjusted'
)
returns table(success boolean, error_message text, new_balance integer) as $$
declare
  balance_row public.rider_reward_balance;
  raw_points integer := coalesce(p_points, 0);
  abs_points integer := abs(raw_points);
  normalized_type text := lower(coalesce(p_type, 'adjusted'));
  delta integer;
  is_debit boolean;
  updated_lifetime integer;
begin
  if raw_points = 0 then
    return query select false, 'Points adjustment must be non-zero', null::integer;
    return;
  end if;

  if normalized_type not in ('awarded', 'redeemed', 'adjusted') then
    return query select false, 'Invalid adjustment type', null::integer;
    return;
  end if;

  select *
  into balance_row
  from public.rider_reward_balance
  where rider_id = p_rider_id
  for update;

  if balance_row.rider_id is null then
    return query select false, 'Rider balance not found', null::integer;
    return;
  end if;

  if normalized_type = 'redeemed' then
    delta := -abs_points;
  else
    delta := raw_points;
  end if;

  if coalesce(balance_row.points_balance, 0) + delta < 0 then
    return query select false, 'Insufficient balance for adjustment', null::integer;
    return;
  end if;

  is_debit := delta < 0;
  updated_lifetime :=
    coalesce(balance_row.lifetime_points_earned, 0) +
    case when is_debit then 0 else abs_points end;

  update public.rider_reward_balance
  set
    points_balance = coalesce(points_balance, 0) + delta,
    lifetime_points_earned = updated_lifetime,
    updated_at = now()
  where rider_id = p_rider_id
  returning points_balance into new_balance;

  if normalized_type = 'redeemed' then
    insert into public.reward_redemptions (
      rider_id,
      points_spent,
      status,
      requested_at,
      approved_at,
      metadata
    ) values (
      p_rider_id,
      abs_points,
      'approved',
      now(),
      now(),
      jsonb_build_object(
        'description', coalesce(p_description, 'Manual redemption'),
        'source', 'admin_manual_adjustment'
      )
    );
  else
    insert into public.reward_transactions (
      rider_id,
      points_earned,
      source,
      metadata,
      created_at
    ) values (
      p_rider_id,
      abs_points,
      case
        when normalized_type = 'awarded' then 'bonus'
        else 'adjustment'
      end,
      jsonb_build_object(
        'description', coalesce(p_description, 'Manual adjustment'),
        'adjustment_direction', case when is_debit then 'debit' else 'credit' end
      ),
      now()
    );
  end if;

  return query select true, null::text, new_balance;
exception
  when others then
    return query select false, sqlerrm, null::integer;
end;
$$ language plpgsql security definer set search_path = public;

grant execute on function public.adjust_rider_points_atomic(uuid, integer, text, text) to service_role;
