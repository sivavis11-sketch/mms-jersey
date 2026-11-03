-- MMS Jersey: the parent places the order first and pays after.
--
-- • Students carry an admission number. Parents find a student by typing at least
--   3 letters of the name (or the admission number); the full list is never sent.
-- • Parents enter the jersey number, the name to print and the size.
-- • A placed order starts as Not paid (payment_status 'pending'). Uploading a payment
--   screenshot makes it Paid · not verified ('submitted'); the admin then verifies it,
--   or records cash at the school office.
--
-- Safe to run more than once.

-- 1. Admission number -----------------------------------------------------------

ALTER TABLE jersey.players ADD COLUMN IF NOT EXISTS admission_no TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS players_admission_no_key ON jersey.players (admission_no);
ALTER TABLE jersey.orders ADD COLUMN IF NOT EXISTS admission_no TEXT;
ALTER TABLE jersey.orders ALTER COLUMN order_status SET DEFAULT 'new';

-- Every order keeps a copy of the student's admission number, however it was created.
CREATE OR REPLACE FUNCTION jersey.copy_admission_no()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = ''
AS $$
BEGIN
  IF NEW.admission_no IS NULL AND NEW.player_id IS NOT NULL THEN
    SELECT admission_no INTO NEW.admission_no FROM jersey.players WHERE id = NEW.player_id;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS orders_copy_admission_no ON jersey.orders;
CREATE TRIGGER orders_copy_admission_no BEFORE INSERT ON jersey.orders
  FOR EACH ROW EXECUTE FUNCTION jersey.copy_admission_no();

-- 2. Parent search --------------------------------------------------------------
-- The whole student list is no longer public.

DROP FUNCTION IF EXISTS public.jersey_list_players();

CREATE OR REPLACE FUNCTION public.jersey_search_players(p_query TEXT)
RETURNS TABLE (id UUID, full_name TEXT, class_name TEXT, admission_no TEXT, order_state TEXT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  WITH q AS (
    SELECT translate(lower(regexp_replace(trim(coalesce(p_query, '')), '\s+', ' ', 'g')), '%_\', '') AS t
  )
  SELECT p.id, p.full_name, p.class_name, p.admission_no, coalesce(o.payment_status, 'none')
  FROM jersey.players p
  CROSS JOIN q
  LEFT JOIN jersey.orders o ON o.player_id = p.id AND o.order_status <> 'cancelled'
  WHERE p.is_active
    AND length(q.t) >= 3
    AND (lower(p.full_name) LIKE '%' || q.t || '%'
         OR (q.t ~ '^[0-9]+$' AND p.admission_no LIKE q.t || '%'))
  ORDER BY (lower(p.full_name) LIKE q.t || '%') DESC, p.full_name
  LIMIT 8;
$$;

-- 3. Place the order (no payment yet) ------------------------------------------
-- If the student already has an unpaid order, it is updated instead, so a parent who
-- changes their mind (or lost the page) is not stuck. Paid orders cannot be changed.

DROP FUNCTION IF EXISTS public.jersey_place_order(UUID, TEXT, TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.jersey_place_order(
  p_player_id UUID,
  p_jersey_number INT,
  p_print_name TEXT,
  p_jersey_size TEXT
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

  SELECT * INTO pl FROM jersey.players WHERE id = p_player_id AND is_active;
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

  SELECT * INTO existing FROM jersey.orders
  WHERE player_id = pl.id AND order_status <> 'cancelled'
  FOR UPDATE;

  IF existing.id IS NOT NULL THEN
    IF existing.payment_status IN ('submitted','verified') THEN
      RAISE EXCEPTION 'An order for % is already placed and paid (%).', pl.full_name, existing.order_id;
    END IF;
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

-- 4. Pay for a placed order -----------------------------------------------------

CREATE OR REPLACE FUNCTION public.jersey_submit_payment(
  p_order_id TEXT,
  p_access_token TEXT,
  p_payment_method TEXT,
  p_payment_proof TEXT,
  p_payment_reference TEXT DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  existing jersey.orders;
  result jersey.orders;
  clean_ref TEXT := nullif(trim(coalesce(p_payment_reference, '')), '');
BEGIN
  SELECT * INTO existing FROM jersey.orders
  WHERE order_id = p_order_id AND access_token = p_access_token
  FOR UPDATE;
  IF existing.id IS NULL THEN
    RAISE EXCEPTION 'Order not found';
  END IF;
  IF existing.order_status = 'cancelled' THEN
    RAISE EXCEPTION 'This order was cancelled. Please contact the school.';
  END IF;
  IF existing.payment_status IN ('submitted','verified') THEN
    RAISE EXCEPTION 'This order is already paid.';
  END IF;
  IF p_payment_method NOT IN ('UPI','QR','Bank Transfer') THEN
    RAISE EXCEPTION 'Please choose a payment method.';
  END IF;
  IF p_payment_proof IS NULL OR NOT EXISTS (
    SELECT 1 FROM storage.objects WHERE bucket_id = 'jersey-proofs' AND name = p_payment_proof
  ) THEN
    RAISE EXCEPTION 'Please upload your payment screenshot.';
  END IF;
  IF clean_ref IS NOT NULL AND length(clean_ref) > 40 THEN
    RAISE EXCEPTION 'The reference number is too long.';
  END IF;

  UPDATE jersey.orders SET
    payment_method = p_payment_method,
    payment_proof = p_payment_proof,
    payment_reference = clean_ref,
    payment_status = 'submitted',
    payment_submitted_at = now(),
    payment_rejection_reason = NULL,
    order_status = CASE WHEN order_status = 'new' THEN 'payment_submitted' ELSE order_status END
  WHERE id = existing.id
  RETURNING * INTO result;

  RETURN jersey.order_json(result) - 'payment_proof' - 'payment_verified_by' - 'admin_notes';
END;
$$;

-- 5. Admin: admission number on students ----------------------------------------

DROP FUNCTION IF EXISTS public.jersey_admin_list_players();
CREATE OR REPLACE FUNCTION public.jersey_admin_list_players()
RETURNS TABLE (
  id UUID, full_name TEXT, class_name TEXT, admission_no TEXT, jersey_number INT, print_name TEXT,
  jersey_size TEXT, chest_in NUMERIC, is_active BOOLEAN, order_id TEXT, order_state TEXT, payment_method TEXT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  PERFORM jersey.require_admin();
  RETURN QUERY
    SELECT p.id, p.full_name, p.class_name, p.admission_no, p.jersey_number, p.print_name, p.jersey_size,
           p.chest_in, p.is_active, o.order_id, coalesce(o.payment_status, 'none'), o.payment_method
    FROM jersey.players p
    LEFT JOIN jersey.orders o ON o.player_id = p.id AND o.order_status <> 'cancelled'
    ORDER BY p.class_name NULLS LAST, p.full_name;
END;
$$;

DROP FUNCTION IF EXISTS public.jersey_admin_save_player(UUID, TEXT, TEXT, INT, TEXT, TEXT, BOOLEAN, NUMERIC);
CREATE OR REPLACE FUNCTION public.jersey_admin_save_player(
  p_id UUID, p_full_name TEXT, p_class_name TEXT, p_jersey_number INT,
  p_print_name TEXT, p_jersey_size TEXT, p_is_active BOOLEAN DEFAULT true, p_chest_in NUMERIC DEFAULT NULL,
  p_admission_no TEXT DEFAULT NULL
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
    INSERT INTO jersey.players (full_name, class_name, admission_no, jersey_number, print_name, jersey_size, chest_in, is_active)
    VALUES (trim(p_full_name), nullif(trim(p_class_name), ''), clean_adm, p_jersey_number,
            nullif(upper(trim(p_print_name)), ''), final_size, p_chest_in, coalesce(p_is_active, true))
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
      updated_at = now()
    WHERE id = p_id
    RETURNING id INTO new_id;
    IF new_id IS NULL THEN RAISE EXCEPTION 'Player not found'; END IF;
  END IF;
  RETURN new_id;
END;
$$;

-- p_rows: [{"admission_no": "46962026", "full_name": "...", "class_name": "..."}, ...]
-- A row whose admission number is already on file updates that student instead of
-- adding a second copy, so the same list can be uploaded again safely.
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
             nullif(trim(r.v->>'jersey_size'), '') AS jersey_size
      FROM jsonb_array_elements(p_rows) WITH ORDINALITY AS r(v, n)
      WHERE nullif(trim(r.v->>'full_name'), '') IS NOT NULL
    ) x
    ORDER BY coalesce(x.admission_no, x.n::TEXT), x.n DESC
  )
  INSERT INTO jersey.players (admission_no, full_name, class_name, jersey_number, print_name, chest_in, jersey_size)
  SELECT admission_no, full_name, class_name, jersey_number, print_name, chest_in,
         coalesce(jersey_size, jersey.size_for_chest(chest_in))
  FROM rows
  ON CONFLICT (admission_no) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    class_name = EXCLUDED.class_name,
    is_active = true,
    updated_at = now();
  GET DIAGNOSTICS added = ROW_COUNT;
  RETURN added;
END;
$$;

-- 6. Function permissions -------------------------------------------------------

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
