-- Migration 046: Atomic platform rate-limit hit (fixes TOCTOU on counters)
-- Safe to re-run.

CREATE OR REPLACE FUNCTION public.platform_rate_limit_hit(
  p_key text,
  p_window_start timestamptz,
  p_max integer
)
RETURNS boolean
LANGUAGE plpgsql
AS $$
DECLARE
  new_count integer;
BEGIN
  IF p_max IS NULL OR p_max < 1 THEN
    RAISE EXCEPTION 'p_max must be >= 1';
  END IF;

  INSERT INTO public.platform_rate_limit_counter AS c (key, window_start, count)
  VALUES (p_key, p_window_start, 1)
  ON CONFLICT (key, window_start)
  DO UPDATE
    SET count = c.count + 1
    WHERE c.count < p_max
  RETURNING c.count INTO new_count;

  IF new_count IS NULL THEN
    RETURN false;
  END IF;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.platform_rate_limit_hit(text, timestamptz, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.platform_rate_limit_hit(text, timestamptz, integer) TO service_role;
