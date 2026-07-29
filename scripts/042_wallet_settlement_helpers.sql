-- Migration 042: Internal wallet settlement helpers (debit + compensating refund).
--
-- Design contract (mirrors scripts/rewards-adjustment-rpc.sql):
--   • Append-only ledger via reward_transactions — never UPDATE/DELETE prior rows.
--   • points_earned is SIGNED (positive = credit/refund, negative = debit).
--   • Balance updates via apply_reward_transaction_to_balance AFTER INSERT trigger
--     — these RPCs must NOT also UPDATE rider_reward_balance explicitly.
--   • Overdraft guarded under row lock (FOR UPDATE) for concurrent debit safety.
--   • Internal-only: grant to service_role; not a public Platform API contract.
--
-- Run in the Supabase SQL Editor to deploy or update.

-- ---------------------------------------------------------------------------
-- Immediate debit for redemption commitment
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.wallet_settle_debit(
  p_rider_id       uuid,
  p_points         integer,
  p_redemption_id  text,
  p_correlation_id text
)
RETURNS TABLE(
  success boolean,
  error_message text,
  transaction_id uuid,
  new_balance integer
) AS $$
DECLARE
  abs_points     integer := abs(coalesce(p_points, 0));
  balance_row    public.rider_reward_balance;
  txn_id         uuid;
  result_balance integer;
BEGIN
  IF abs_points = 0 OR p_points IS NULL OR p_points < 0 THEN
    RETURN QUERY SELECT false, 'Points debit must be a positive integer', null::uuid, null::integer;
    RETURN;
  END IF;

  IF p_redemption_id IS NULL OR length(trim(p_redemption_id)) = 0 THEN
    RETURN QUERY SELECT false, 'redemption_id is required', null::uuid, null::integer;
    RETURN;
  END IF;

  IF p_correlation_id IS NULL OR length(trim(p_correlation_id)) = 0 THEN
    RETURN QUERY SELECT false, 'correlation_id is required', null::uuid, null::integer;
    RETURN;
  END IF;

  INSERT INTO public.rider_reward_balance (rider_id, points_balance, lifetime_points_earned, updated_at)
  VALUES (p_rider_id, 0, 0, now())
  ON CONFLICT (rider_id) DO NOTHING;

  SELECT *
  INTO   balance_row
  FROM   public.rider_reward_balance
  WHERE  rider_id = p_rider_id
  FOR UPDATE;

  IF coalesce(balance_row.points_balance, 0) < abs_points THEN
    RETURN QUERY SELECT false, 'Insufficient balance for debit', null::uuid, null::integer;
    RETURN;
  END IF;

  INSERT INTO public.reward_transactions (
    rider_id,
    points_earned,
    source,
    metadata,
    created_at
  ) VALUES (
    p_rider_id,
    -abs_points,
    'adjustment',
    jsonb_build_object(
      'settlement_kind', 'debit',
      'redemption_id', p_redemption_id,
      'correlation_id', p_correlation_id,
      'adjustment_direction', 'debit'
    ),
    now()
  )
  RETURNING id INTO txn_id;

  SELECT points_balance
  INTO   result_balance
  FROM   public.rider_reward_balance
  WHERE  rider_id = p_rider_id;

  RETURN QUERY SELECT true, null::text, txn_id, result_balance;

EXCEPTION
  WHEN others THEN
    RETURN QUERY SELECT false, sqlerrm, null::uuid, null::integer;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ---------------------------------------------------------------------------
-- Compensating refund — append-only credit; never mutates prior debit
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.wallet_settle_refund(
  p_rider_id       uuid,
  p_points         integer,
  p_fulfilment_id text,
  p_reason         text,
  p_correlation_id text
)
RETURNS TABLE(
  success boolean,
  error_message text,
  transaction_id uuid,
  new_balance integer
) AS $$
DECLARE
  abs_points     integer := abs(coalesce(p_points, 0));
  txn_id         uuid;
  result_balance integer;
BEGIN
  IF abs_points = 0 OR p_points IS NULL OR p_points < 0 THEN
    RETURN QUERY SELECT false, 'Points refund must be a positive integer', null::uuid, null::integer;
    RETURN;
  END IF;

  IF p_fulfilment_id IS NULL OR length(trim(p_fulfilment_id)) = 0 THEN
    RETURN QUERY SELECT false, 'fulfilment_id is required', null::uuid, null::integer;
    RETURN;
  END IF;

  IF p_reason IS NULL OR length(trim(p_reason)) = 0 THEN
    RETURN QUERY SELECT false, 'reason is required', null::uuid, null::integer;
    RETURN;
  END IF;

  IF p_correlation_id IS NULL OR length(trim(p_correlation_id)) = 0 THEN
    RETURN QUERY SELECT false, 'correlation_id is required', null::uuid, null::integer;
    RETURN;
  END IF;

  INSERT INTO public.rider_reward_balance (rider_id, points_balance, lifetime_points_earned, updated_at)
  VALUES (p_rider_id, 0, 0, now())
  ON CONFLICT (rider_id) DO NOTHING;

  -- Lock for serialised balance reads after trigger update.
  PERFORM 1
  FROM   public.rider_reward_balance
  WHERE  rider_id = p_rider_id
  FOR UPDATE;

  INSERT INTO public.reward_transactions (
    rider_id,
    points_earned,
    source,
    metadata,
    created_at
  ) VALUES (
    p_rider_id,
    abs_points,
    'adjustment',
    jsonb_build_object(
      'settlement_kind', 'compensating_refund',
      'fulfilment_id', p_fulfilment_id,
      'reason', p_reason,
      'correlation_id', p_correlation_id,
      'adjustment_direction', 'credit'
    ),
    now()
  )
  RETURNING id INTO txn_id;

  SELECT points_balance
  INTO   result_balance
  FROM   public.rider_reward_balance
  WHERE  rider_id = p_rider_id;

  RETURN QUERY SELECT true, null::text, txn_id, result_balance;

EXCEPTION
  WHEN others THEN
    RETURN QUERY SELECT false, sqlerrm, null::uuid, null::integer;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.wallet_settle_debit(uuid, integer, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.wallet_settle_refund(uuid, integer, text, text, text) TO service_role;
