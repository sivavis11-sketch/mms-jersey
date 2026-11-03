-- MMS Jersey: the coach sets each player's jersey size from their chest measurement.
--
-- • The admin types a child's chest size (inches); the size chart turns it into the jersey
--   size, stored on the student.
-- • Parents only choose the jersey number and the name to print. The order always takes the
--   size the coach set, and a child without a size can't be ordered for yet.
--
-- Safe to run more than once.

-- 1. Parent search also returns the size the coach set ---------------------------

DROP FUNCTION IF EXISTS public.jersey_search_players(TEXT);
CREATE OR REPLACE FUNCTION public.jersey_search_players(p_query TEXT)
RETURNS TABLE (
  id UUID, full_name TEXT, class_name TEXT, admission_no TEXT, order_state TEXT,
  order_count INT, last_order_id TEXT, last_jersey_number INT, last_jersey_size TEXT,
  jersey_size TEXT
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  WITH q AS (
    SELECT translate(lower(regexp_replace(trim(coalesce(p_query, '')), '\s+', ' ', 'g')), '%_\', '') AS t
  )
  SELECT p.id, p.full_name, p.class_name, p.admission_no, coalesce(o.payment_status, 'none'),
         coalesce(o.n, 0), o.order_id, o.jersey_number, o.jersey_size, p.jersey_size
  FROM jersey.players p
  CROSS JOIN q
  LEFT JOIN LATERAL (
    SELECT lo.payment_status, lo.order_id, lo.jersey_number, lo.jersey_size,
           count(*) OVER ()::INT AS n
    FROM jersey.orders lo
    WHERE lo.player_id = p.id AND lo.order_status <> 'cancelled'
    ORDER BY lo.created_at DESC
    LIMIT 1
  ) o ON true
  WHERE p.is_active
    AND length(q.t) >= 3
    AND (lower(p.full_name) LIKE '%' || q.t || '%'
         OR (q.t ~ '^[0-9]+$' AND p.admission_no LIKE q.t || '%'))
  ORDER BY (lower(p.full_name) LIKE q.t || '%') DESC, p.full_name
  LIMIT 8;
$$;

-- 2. Place the order with the coach's size ------------------------------------------
-- p_jersey_size is kept so older pages still work, but it is ignored.

CREATE OR REPLACE FUNCTION public.jersey_place_order(
  p_player_id UUID,
  p_jersey_number INT,
  p_print_name TEXT,
  p_jersey_size TEXT,
  p_new_set BOOLEAN DEFAULT false
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  cfg jersey.settings;
  pl jersey.players;
  existing jersey.orders;
  result jersey.orders;
  final_size TEXT;
  clean_print TEXT := upper(regexp_replace(trim(coalesce(p_print_name, '')), '\s+', ' ', 'g'));
BEGIN
  SELECT * INTO cfg FROM jersey.settings WHERE id = 1;
  IF NOT cfg.orders_open THEN
    RAISE EXCEPTION 'Orders are closed right now. Please contact the school.';
  END IF;

  SELECT * INTO pl FROM jersey.players WHERE id = p_player_id AND is_active FOR UPDATE;
  IF pl.id IS NULL THEN
    RAISE EXCEPTION 'Student not found. Please search for the name again.';
  END IF;

  IF p_jersey_number IS NULL OR p_jersey_number NOT BETWEEN 0 AND 99 THEN
    RAISE EXCEPTION 'Enter a jersey number from 0 to 99.';
  END IF;
  IF clean_print = '' OR length(clean_print) > 12 OR clean_print !~ '^[A-Z][A-Z .''-]*$' THEN
    RAISE EXCEPTION 'Enter the name to print: up to 12 letters.';
  END IF;
  -- The coach sets each child's size from their chest measurement; parents can't change it.
  IF pl.jersey_size IS NULL THEN
    RAISE EXCEPTION 'The coach has not set the jersey size for % yet. Please check back later.', pl.full_name;
  END IF;
  final_size := pl.jersey_size;

  IF NOT coalesce(p_new_set, false) THEN
    SELECT * INTO existing FROM jersey.orders
    WHERE player_id = pl.id AND order_status <> 'cancelled' AND payment_status IN ('pending','rejected')
    ORDER BY created_at DESC
    LIMIT 1
    FOR UPDATE;
  END IF;

  IF existing.id IS NOT NULL THEN
    UPDATE jersey.orders SET
      jersey_number = p_jersey_number,
      print_name = clean_print,
      jersey_size = final_size,
      amount = cfg.unit_price
    WHERE id = existing.id
    RETURNING * INTO result;
  ELSE
    INSERT INTO jersey.orders (
      order_id, access_token, player_id, player_name, class_name, admission_no,
      jersey_number, print_name, jersey_size, amount, payment_status, order_status
    ) VALUES (
      'MMS-' || to_char(now(), 'YY') || '-' || nextval('jersey.order_seq'),
      encode(extensions.gen_random_bytes(24), 'hex'),
      pl.id, pl.full_name, pl.class_name, pl.admission_no,
      p_jersey_number, clean_print, final_size, cfg.unit_price, 'pending', 'new'
    )
    RETURNING * INTO result;
  END IF;

  RETURN jersey.order_json(result) - 'payment_proof' - 'payment_verified_by' - 'admin_notes'
    || jsonb_build_object('access_token', result.access_token);
END;
$$;

-- 3. Admin: set a child's chest size ----------------------------------------------
-- An empty chest (NULL or 0) clears both the chest and the jersey size.

CREATE OR REPLACE FUNCTION public.jersey_admin_set_chest(p_id UUID, p_chest_in NUMERIC)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE pl jersey.players;
BEGIN
  PERFORM jersey.require_admin();
  IF p_chest_in IS NOT NULL AND p_chest_in <> 0 AND NOT (p_chest_in BETWEEN 5 AND 40) THEN
    RAISE EXCEPTION 'Chest size must be in inches, for example 15.5';
  END IF;
  UPDATE jersey.players SET
    chest_in = nullif(p_chest_in, 0),
    jersey_size = jersey.size_for_chest(nullif(p_chest_in, 0)),
    updated_at = now()
  WHERE id = p_id
  RETURNING * INTO pl;
  IF pl.id IS NULL THEN RAISE EXCEPTION 'Student not found'; END IF;
  RETURN jsonb_build_object('id', pl.id, 'chest_in', pl.chest_in, 'jersey_size', pl.jersey_size);
END;
$$;

-- 4. Function permissions ---------------------------------------------------------

DO $$
DECLARE f RECORD;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure AS sig, p.proname
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE (n.nspname = 'public' AND p.proname LIKE 'jersey\_%') OR n.nspname = 'jersey'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', f.sig);
    IF f.proname IN ('jersey_get_settings','jersey_search_players','jersey_place_order',
                     'jersey_submit_payment','jersey_get_order','jersey_is_admin') THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon, authenticated', f.sig);
    ELSIF f.proname LIKE 'jersey\_admin\_%' THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f.sig);
    END IF;
  END LOOP;
END;
$$;

NOTIFY pgrst, 'reload schema';
