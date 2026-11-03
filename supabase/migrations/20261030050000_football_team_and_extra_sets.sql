-- MMS Jersey: football team list, new players and extra sets.
--
-- • Students on the football team carry is_football. The admin sees who on the team
--   has not ordered yet, and orders for children who are not on the team are tagged
--   "New player".
-- • A child may order more than one set. Each order after the first is an "Extra set".
--   A parent who goes back to a child with an unpaid order still updates that order,
--   unless they choose to order another set.
--
-- Safe to run more than once.

-- 1. Football team --------------------------------------------------------------

ALTER TABLE jersey.players ADD COLUMN IF NOT EXISTS is_football BOOLEAN NOT NULL DEFAULT false;

-- The football list Siva sent on 2026-10-29 (58 students, by admission number).
UPDATE jersey.players SET is_football = true, updated_at = now()
WHERE admission_no IN (
  '37162021', '30922018', '45672025', '40192023', '24952016', '40222023', '46632026', '42722024',
  '42292024', '26012016', '46072026', '25062016', '24472016', '25032016', '42502024', '41842024',
  '43812025', '31332018', '39652022', '36972021', '41362023', '43032024', '44632025', '38412022',
  '34372019', '47492026', '45912026', '45922026', '43242024', '47152026', '37662021', '26892017',
  '45022025', '46152026', '40152023', '46282026', '46492026', '43592025', '43572025', '47372026',
  '41542023', '33372022', '46602026', '39262022', '46382026', '44292025', '33282018', '44862025',
  '37562021', '39552022', '21472015', '45072025', '45242025', '42672024', '22102015', '46322026',
  '39662022', '47602026'
) AND NOT is_football;

-- 2. More than one order per child ----------------------------------------------

DROP INDEX IF EXISTS jersey.orders_one_live_per_player;
CREATE INDEX IF NOT EXISTS orders_player_idx ON jersey.orders (player_id, created_at);

-- 3. Parent search: one row per child, with their orders summed up ---------------

DROP FUNCTION IF EXISTS public.jersey_search_players(TEXT);
CREATE OR REPLACE FUNCTION public.jersey_search_players(p_query TEXT)
RETURNS TABLE (
  id UUID, full_name TEXT, class_name TEXT, admission_no TEXT, order_state TEXT,
  order_count INT, last_order_id TEXT, last_jersey_number INT, last_jersey_size TEXT
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  WITH q AS (
    SELECT translate(lower(regexp_replace(trim(coalesce(p_query, '')), '\s+', ' ', 'g')), '%_\', '') AS t
  )
  SELECT p.id, p.full_name, p.class_name, p.admission_no, coalesce(o.payment_status, 'none'),
         coalesce(o.n, 0), o.order_id, o.jersey_number, o.jersey_size
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

-- 4. Place the order --------------------------------------------------------------
-- p_new_set = false: update the child's latest unpaid order if there is one, else add one.
-- p_new_set = true: always add a new order (an extra set).

DROP FUNCTION IF EXISTS public.jersey_place_order(UUID, INT, TEXT, TEXT);
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
  IF p_jersey_size IS NULL OR NOT (p_jersey_size = ANY (cfg.sizes)) THEN
    RAISE EXCEPTION 'Please choose a jersey size.';
  END IF;

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
      jersey_size = p_jersey_size,
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
      p_jersey_number, clean_print, p_jersey_size, cfg.unit_price, 'pending', 'new'
    )
    RETURNING * INTO result;
  END IF;

  RETURN jersey.order_json(result) - 'payment_proof' - 'payment_verified_by' - 'admin_notes'
    || jsonb_build_object('access_token', result.access_token);
END;
$$;

-- 5. Admin: orders carry the football tag and which set they are -----------------

CREATE OR REPLACE FUNCTION public.jersey_admin_list_orders()
RETURNS SETOF JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  PERFORM jersey.require_admin();
  RETURN QUERY
    SELECT jersey.order_json(o) || jsonb_build_object(
             'is_football', coalesce(p.is_football, false),
             'set_no', CASE WHEN o.order_status = 'cancelled' OR o.player_id IS NULL THEN NULL
                            ELSE count(*) FILTER (WHERE o.order_status <> 'cancelled') OVER (
                                   PARTITION BY o.player_id ORDER BY o.created_at, o.id) END)
    FROM jersey.orders o
    LEFT JOIN jersey.players p ON p.id = o.player_id
    ORDER BY o.created_at DESC;
END;
$$;

-- 6. Admin: students, one row each, with football and order count -----------------

DROP FUNCTION IF EXISTS public.jersey_admin_list_players();
CREATE OR REPLACE FUNCTION public.jersey_admin_list_players()
RETURNS TABLE (
  id UUID, full_name TEXT, class_name TEXT, admission_no TEXT, jersey_number INT, print_name TEXT,
  jersey_size TEXT, chest_in NUMERIC, is_active BOOLEAN, order_id TEXT, order_state TEXT, payment_method TEXT,
  is_football BOOLEAN, order_count INT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  PERFORM jersey.require_admin();
  RETURN QUERY
    SELECT p.id, p.full_name, p.class_name, p.admission_no, p.jersey_number, p.print_name, p.jersey_size,
           p.chest_in, p.is_active, o.order_id, coalesce(o.payment_status, 'none'), o.payment_method,
           p.is_football, coalesce(o.n, 0)
    FROM jersey.players p
    LEFT JOIN LATERAL (
      SELECT lo.order_id, lo.payment_status, lo.payment_method, count(*) OVER ()::INT AS n
      FROM jersey.orders lo
      WHERE lo.player_id = p.id AND lo.order_status <> 'cancelled'
      ORDER BY lo.created_at DESC
      LIMIT 1
    ) o ON true
    ORDER BY p.class_name NULLS LAST, p.full_name;
END;
$$;

DROP FUNCTION IF EXISTS public.jersey_admin_save_player(UUID, TEXT, TEXT, INT, TEXT, TEXT, BOOLEAN, NUMERIC, TEXT);
CREATE OR REPLACE FUNCTION public.jersey_admin_save_player(
  p_id UUID, p_full_name TEXT, p_class_name TEXT, p_jersey_number INT,
  p_print_name TEXT, p_jersey_size TEXT, p_is_active BOOLEAN DEFAULT true, p_chest_in NUMERIC DEFAULT NULL,
  p_admission_no TEXT DEFAULT NULL, p_is_football BOOLEAN DEFAULT NULL
)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  new_id UUID;
  final_size TEXT := coalesce(nullif(trim(p_jersey_size), ''), jersey.size_for_chest(p_chest_in));
  clean_adm TEXT := nullif(trim(coalesce(p_admission_no, '')), '');
BEGIN
  PERFORM jersey.require_admin();
  IF clean_adm IS NOT NULL AND EXISTS (
    SELECT 1 FROM jersey.players WHERE admission_no = clean_adm AND id IS DISTINCT FROM p_id
  ) THEN
    RAISE EXCEPTION 'Admission number % is already used by another student', clean_adm;
  END IF;
  IF p_id IS NULL THEN
    INSERT INTO jersey.players (full_name, class_name, admission_no, jersey_number, print_name, jersey_size,
                                chest_in, is_active, is_football)
    VALUES (trim(p_full_name), nullif(trim(p_class_name), ''), clean_adm, p_jersey_number,
            nullif(upper(trim(p_print_name)), ''), final_size, p_chest_in, coalesce(p_is_active, true),
            coalesce(p_is_football, false))
    RETURNING id INTO new_id;
  ELSE
    UPDATE jersey.players SET
      full_name = trim(p_full_name),
      class_name = nullif(trim(p_class_name), ''),
      admission_no = clean_adm,
      jersey_number = p_jersey_number,
      print_name = nullif(upper(trim(p_print_name)), ''),
      jersey_size = final_size,
      chest_in = p_chest_in,
      is_active = coalesce(p_is_active, true),
      is_football = coalesce(p_is_football, is_football),
      updated_at = now()
    WHERE id = p_id
    RETURNING id INTO new_id;
    IF new_id IS NULL THEN RAISE EXCEPTION 'Player not found'; END IF;
  END IF;
  RETURN new_id;
END;
$$;

-- p_rows: [{"admission_no": "...", "full_name": "...", "class_name": "...", "is_football": true}, ...]
-- is_football is optional: a row without it leaves the student's football tag as it was.
CREATE OR REPLACE FUNCTION public.jersey_admin_import_players(p_rows JSONB)
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE added INT;
BEGIN
  PERFORM jersey.require_admin();
  WITH rows AS (
    SELECT DISTINCT ON (coalesce(x.admission_no, x.n::TEXT)) x.*
    FROM (
      SELECT r.n,
             nullif(trim(r.v->>'admission_no'), '') AS admission_no,
             trim(r.v->>'full_name') AS full_name,
             nullif(trim(r.v->>'class_name'), '') AS class_name,
             nullif(trim(r.v->>'jersey_number'), '')::INT AS jersey_number,
             nullif(upper(trim(r.v->>'print_name')), '') AS print_name,
             nullif(trim(r.v->>'chest_in'), '')::NUMERIC AS chest_in,
             nullif(trim(r.v->>'jersey_size'), '') AS jersey_size,
             CASE WHEN jsonb_typeof(r.v->'is_football') = 'boolean' THEN (r.v->>'is_football')::BOOLEAN END AS is_football
      FROM jsonb_array_elements(p_rows) WITH ORDINALITY AS r(v, n)
      WHERE nullif(trim(r.v->>'full_name'), '') IS NOT NULL
    ) x
    ORDER BY coalesce(x.admission_no, x.n::TEXT), x.n DESC
  )
  INSERT INTO jersey.players (admission_no, full_name, class_name, jersey_number, print_name, chest_in,
                              jersey_size, is_football)
  SELECT admission_no, full_name, class_name, jersey_number, print_name, chest_in,
         coalesce(jersey_size, jersey.size_for_chest(chest_in)), coalesce(is_football, false)
  FROM rows
  ON CONFLICT (admission_no) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    class_name = coalesce(EXCLUDED.class_name, jersey.players.class_name),
    is_active = true,
    updated_at = now();
  GET DIAGNOSTICS added = ROW_COUNT;

  -- Football tags from the upload, for students who were already on file too.
  UPDATE jersey.players p SET is_football = r.f, updated_at = now()
  FROM (
    SELECT nullif(trim(v->>'admission_no'), '') AS adm, (v->>'is_football')::BOOLEAN AS f
    FROM jsonb_array_elements(p_rows) AS v
    WHERE jsonb_typeof(v->'is_football') = 'boolean'
  ) r
  WHERE r.adm IS NOT NULL AND p.admission_no = r.adm AND p.is_football IS DISTINCT FROM r.f;

  RETURN added;
END;
$$;

-- 7. Cash at the office: pays the child's latest unpaid order, or adds a new one --

CREATE OR REPLACE FUNCTION public.jersey_admin_record_cash(
  p_player_id UUID, p_received_amount NUMERIC, p_jersey_size TEXT DEFAULT NULL, p_note TEXT DEFAULT NULL,
  p_received_from TEXT DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  cfg jersey.settings;
  pl jersey.players;
  existing jersey.orders;
  result jersey.orders;
BEGIN
  PERFORM jersey.require_admin();
  IF p_received_amount IS NULL OR p_received_amount <= 0 THEN
    RAISE EXCEPTION 'Enter the cash amount received';
  END IF;
  SELECT * INTO cfg FROM jersey.settings WHERE id = 1;
  SELECT * INTO pl FROM jersey.players WHERE id = p_player_id;
  IF pl.id IS NULL THEN RAISE EXCEPTION 'Player not found'; END IF;

  SELECT * INTO existing FROM jersey.orders
  WHERE player_id = pl.id AND order_status <> 'cancelled' AND payment_status <> 'verified'
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF existing.id IS NOT NULL THEN
    UPDATE jersey.orders SET
      jersey_size = coalesce(nullif(trim(p_jersey_size), ''), jersey_size),
      payment_method = 'Cash',
      payment_status = 'verified',
      payment_received_amount = p_received_amount,
      payment_reference = nullif(trim(coalesce(p_note, '')), ''),
      payment_verified_at = now(),
      payment_verified_by = auth.jwt()->>'email',
      payment_rejection_reason = NULL,
      receipt_no = coalesce(receipt_no, 'MMS-CR-' || lpad(nextval('jersey.receipt_seq')::TEXT, 4, '0')),
      received_from = nullif(trim(coalesce(p_received_from, '')), ''),
      order_status = CASE WHEN order_status IN ('new','payment_submitted') THEN 'confirmed' ELSE order_status END
    WHERE id = existing.id
    RETURNING * INTO result;
  ELSE
    INSERT INTO jersey.orders (
      order_id, access_token, player_id, player_name, class_name, admission_no, jersey_number, print_name,
      jersey_size, amount, payment_status, payment_method, payment_reference,
      payment_received_amount, payment_verified_at, payment_verified_by, order_status,
      receipt_no, received_from
    ) VALUES (
      'MMS-' || to_char(now(), 'YY') || '-' || nextval('jersey.order_seq'),
      encode(extensions.gen_random_bytes(24), 'hex'),
      pl.id, pl.full_name, pl.class_name, pl.admission_no, pl.jersey_number, pl.print_name,
      coalesce(nullif(trim(p_jersey_size), ''), pl.jersey_size, '—'), cfg.unit_price, 'verified', 'Cash',
      nullif(trim(coalesce(p_note, '')), ''), p_received_amount, now(), auth.jwt()->>'email', 'confirmed',
      'MMS-CR-' || lpad(nextval('jersey.receipt_seq')::TEXT, 4, '0'), nullif(trim(coalesce(p_received_from, '')), '')
    )
    RETURNING * INTO result;
  END IF;
  RETURN jersey.order_json(result);
END;
$$;

-- 8. Function permissions ---------------------------------------------------------

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
