-- MMS Jersey ordering app.
--
-- Everything lives in its own `jersey` schema so it never touches the tournament
-- (TMS) tables in `public`. The `jersey` schema is NOT exposed through the REST API:
-- the browser can only reach it through the `public.jersey_*` functions below,
-- which check every input and, for admin actions, check the admin allow-list.
--
-- Idempotent: safe to run more than once in the Supabase SQL editor.

CREATE SCHEMA IF NOT EXISTS jersey;
REVOKE ALL ON SCHEMA jersey FROM PUBLIC, anon, authenticated;

-- 1. Tables -------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS jersey.settings (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  season_label TEXT NOT NULL DEFAULT 'Season 2026',
  unit_price NUMERIC(10,2) NOT NULL DEFAULT 700 CHECK (unit_price > 0),
  sizes TEXT[] NOT NULL DEFAULT ARRAY['22','24','26','28','30','32','34','S','M','L','XL'],
  parents_can_change_size BOOLEAN NOT NULL DEFAULT true,
  orders_open BOOLEAN NOT NULL DEFAULT true,
  upi_id TEXT NOT NULL DEFAULT '',
  payee_name TEXT NOT NULL DEFAULT 'MMS School',
  bank_account_name TEXT NOT NULL DEFAULT '',
  bank_account_number TEXT NOT NULL DEFAULT '',
  bank_name TEXT NOT NULL DEFAULT '',
  bank_ifsc TEXT NOT NULL DEFAULT '',
  bank_branch TEXT NOT NULL DEFAULT '',
  contact_note TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO jersey.settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS jersey.admin_users (
  email TEXT PRIMARY KEY CHECK (email = lower(email)),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS jersey.players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL CHECK (length(trim(full_name)) BETWEEN 1 AND 80),
  class_name TEXT,
  jersey_number INT CHECK (jersey_number IS NULL OR jersey_number BETWEEN 0 AND 99),
  print_name TEXT CHECK (print_name IS NULL OR length(print_name) <= 20),
  jersey_size TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS players_name_idx ON jersey.players (lower(full_name));

CREATE SEQUENCE IF NOT EXISTS jersey.order_seq START 1001;

CREATE TABLE IF NOT EXISTS jersey.orders (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  order_id TEXT NOT NULL UNIQUE,
  access_token TEXT NOT NULL,
  player_id UUID REFERENCES jersey.players(id) ON DELETE SET NULL,
  -- Snapshot of the player at order time, so later edits don't change a placed order.
  player_name TEXT NOT NULL,
  class_name TEXT,
  jersey_number INT,
  print_name TEXT,
  jersey_size TEXT NOT NULL,
  amount NUMERIC(10,2) NOT NULL CHECK (amount >= 0),
  payment_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (payment_status IN ('pending','submitted','verified','rejected')),
  payment_method TEXT CHECK (payment_method IS NULL OR payment_method IN ('UPI','QR','Bank Transfer','Cash')),
  payment_proof TEXT,
  payment_reference TEXT,
  payment_submitted_at TIMESTAMPTZ,
  payment_received_amount NUMERIC(10,2),
  payment_verified_at TIMESTAMPTZ,
  payment_verified_by TEXT,
  payment_rejection_reason TEXT,
  order_status TEXT NOT NULL DEFAULT 'payment_submitted'
    CHECK (order_status IN ('new','payment_submitted','confirmed','in_production','ready','delivered','cancelled')),
  admin_notes TEXT
);
CREATE INDEX IF NOT EXISTS orders_created_idx ON jersey.orders (created_at DESC);
-- One live order per player. A cancelled order frees the player to order again.
CREATE UNIQUE INDEX IF NOT EXISTS orders_one_live_per_player
  ON jersey.orders (player_id) WHERE order_status <> 'cancelled' AND player_id IS NOT NULL;

ALTER TABLE jersey.settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE jersey.admin_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE jersey.players ENABLE ROW LEVEL SECURITY;
ALTER TABLE jersey.orders ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA jersey FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA jersey FROM PUBLIC, anon, authenticated;

-- 2. Helpers ------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.jersey_is_admin()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM jersey.admin_users
    WHERE email = lower(coalesce(auth.jwt()->>'email', '')) AND is_active
  );
$$;

CREATE OR REPLACE FUNCTION jersey.require_admin()
RETURNS VOID LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF NOT public.jersey_is_admin() THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION jersey.order_json(o jersey.orders)
RETURNS JSONB LANGUAGE sql STABLE SET search_path = ''
AS $$
  SELECT to_jsonb(o) - 'access_token';
$$;

-- 3. Parent (public) functions ------------------------------------------------

CREATE OR REPLACE FUNCTION public.jersey_get_settings()
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT to_jsonb(s) - 'id' - 'updated_at' FROM jersey.settings s WHERE id = 1;
$$;

CREATE OR REPLACE FUNCTION public.jersey_list_players()
RETURNS TABLE (
  id UUID, full_name TEXT, class_name TEXT, jersey_number INT, print_name TEXT,
  jersey_size TEXT, order_state TEXT
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT p.id, p.full_name, p.class_name, p.jersey_number, p.print_name, p.jersey_size,
         coalesce(o.payment_status, 'none')
  FROM jersey.players p
  LEFT JOIN jersey.orders o ON o.player_id = p.id AND o.order_status <> 'cancelled'
  WHERE p.is_active
  ORDER BY p.class_name NULLS LAST, p.full_name;
$$;

-- Creates the order with the payment proof in one step. If the player's earlier
-- payment was rejected, the same order is resubmitted instead of creating a new one.
CREATE OR REPLACE FUNCTION public.jersey_place_order(
  p_player_id UUID,
  p_jersey_size TEXT,
  p_payment_method TEXT,
  p_payment_proof TEXT,
  p_payment_reference TEXT DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  cfg jersey.settings;
  pl jersey.players;
  existing jersey.orders;
  result jersey.orders;
  final_size TEXT;
  clean_ref TEXT := nullif(trim(coalesce(p_payment_reference, '')), '');
BEGIN
  SELECT * INTO cfg FROM jersey.settings WHERE id = 1;
  IF NOT cfg.orders_open THEN
    RAISE EXCEPTION 'Orders are closed right now. Please contact the school.';
  END IF;

  SELECT * INTO pl FROM jersey.players WHERE id = p_player_id AND is_active;
  IF pl.id IS NULL THEN
    RAISE EXCEPTION 'Player not found. Please pick the name again.';
  END IF;

  IF cfg.parents_can_change_size OR pl.jersey_size IS NULL THEN
    final_size := p_jersey_size;
  ELSE
    final_size := pl.jersey_size;
  END IF;
  IF final_size IS NULL OR NOT (final_size = ANY (cfg.sizes) OR final_size = pl.jersey_size) THEN
    RAISE EXCEPTION 'Please choose a valid jersey size.';
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

  SELECT * INTO existing FROM jersey.orders
  WHERE player_id = pl.id AND order_status <> 'cancelled'
  FOR UPDATE;

  IF existing.id IS NOT NULL THEN
    IF existing.payment_status IN ('submitted','verified') THEN
      RAISE EXCEPTION 'An order for % has already been placed (%).', pl.full_name, existing.order_id;
    END IF;
    UPDATE jersey.orders SET
      jersey_size = final_size,
      amount = cfg.unit_price,
      payment_method = p_payment_method,
      payment_proof = p_payment_proof,
      payment_reference = clean_ref,
      payment_status = 'submitted',
      payment_submitted_at = now(),
      payment_rejection_reason = NULL,
      order_status = 'payment_submitted'
    WHERE id = existing.id
    RETURNING * INTO result;
  ELSE
    INSERT INTO jersey.orders (
      order_id, access_token, player_id, player_name, class_name, jersey_number, print_name,
      jersey_size, amount, payment_status, payment_method, payment_proof, payment_reference,
      payment_submitted_at, order_status
    ) VALUES (
      'MMS-' || to_char(now(), 'YY') || '-' || nextval('jersey.order_seq'),
      encode(extensions.gen_random_bytes(24), 'hex'),
      pl.id, pl.full_name, pl.class_name, pl.jersey_number, pl.print_name,
      final_size, cfg.unit_price, 'submitted', p_payment_method, p_payment_proof, clean_ref,
      now(), 'payment_submitted'
    )
    RETURNING * INTO result;
  END IF;

  RETURN jersey.order_json(result) || jsonb_build_object('access_token', result.access_token);
END;
$$;

CREATE OR REPLACE FUNCTION public.jersey_get_order(p_order_id TEXT, p_access_token TEXT)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE result jersey.orders;
BEGIN
  SELECT * INTO result FROM jersey.orders
  WHERE order_id = p_order_id AND access_token = p_access_token;
  IF result.id IS NULL THEN
    RAISE EXCEPTION 'Order not found';
  END IF;
  RETURN jersey.order_json(result)
    - 'payment_proof' - 'payment_verified_by' - 'admin_notes';
END;
$$;

-- 4. Admin functions ----------------------------------------------------------

CREATE OR REPLACE FUNCTION public.jersey_admin_list_orders()
RETURNS SETOF JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  PERFORM jersey.require_admin();
  RETURN QUERY SELECT jersey.order_json(o) FROM jersey.orders o ORDER BY o.created_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.jersey_admin_list_players()
RETURNS TABLE (
  id UUID, full_name TEXT, class_name TEXT, jersey_number INT, print_name TEXT,
  jersey_size TEXT, is_active BOOLEAN, order_id TEXT, order_state TEXT, payment_method TEXT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  PERFORM jersey.require_admin();
  RETURN QUERY
    SELECT p.id, p.full_name, p.class_name, p.jersey_number, p.print_name, p.jersey_size, p.is_active,
           o.order_id, coalesce(o.payment_status, 'none'), o.payment_method
    FROM jersey.players p
    LEFT JOIN jersey.orders o ON o.player_id = p.id AND o.order_status <> 'cancelled'
    ORDER BY p.class_name NULLS LAST, p.full_name;
END;
$$;

CREATE OR REPLACE FUNCTION public.jersey_admin_save_player(
  p_id UUID, p_full_name TEXT, p_class_name TEXT, p_jersey_number INT,
  p_print_name TEXT, p_jersey_size TEXT, p_is_active BOOLEAN DEFAULT true
)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE new_id UUID;
BEGIN
  PERFORM jersey.require_admin();
  IF p_id IS NULL THEN
    INSERT INTO jersey.players (full_name, class_name, jersey_number, print_name, jersey_size, is_active)
    VALUES (trim(p_full_name), nullif(trim(p_class_name), ''), p_jersey_number,
            nullif(upper(trim(p_print_name)), ''), nullif(trim(p_jersey_size), ''), coalesce(p_is_active, true))
    RETURNING id INTO new_id;
  ELSE
    UPDATE jersey.players SET
      full_name = trim(p_full_name),
      class_name = nullif(trim(p_class_name), ''),
      jersey_number = p_jersey_number,
      print_name = nullif(upper(trim(p_print_name)), ''),
      jersey_size = nullif(trim(p_jersey_size), ''),
      is_active = coalesce(p_is_active, true),
      updated_at = now()
    WHERE id = p_id
    RETURNING id INTO new_id;
    IF new_id IS NULL THEN RAISE EXCEPTION 'Player not found'; END IF;
  END IF;
  RETURN new_id;
END;
$$;

-- p_rows: [{"full_name": "...", "class_name": "...", "jersey_number": 7, "print_name": "...", "jersey_size": "28"}, ...]
CREATE OR REPLACE FUNCTION public.jersey_admin_import_players(p_rows JSONB)
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE added INT;
BEGIN
  PERFORM jersey.require_admin();
  INSERT INTO jersey.players (full_name, class_name, jersey_number, print_name, jersey_size)
  SELECT trim(r->>'full_name'),
         nullif(trim(r->>'class_name'), ''),
         nullif(trim(r->>'jersey_number'), '')::INT,
         nullif(upper(trim(r->>'print_name')), ''),
         nullif(trim(r->>'jersey_size'), '')
  FROM jsonb_array_elements(p_rows) r
  WHERE nullif(trim(r->>'full_name'), '') IS NOT NULL;
  GET DIAGNOSTICS added = ROW_COUNT;
  RETURN added;
END;
$$;

CREATE OR REPLACE FUNCTION public.jersey_admin_delete_player(p_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  PERFORM jersey.require_admin();
  IF EXISTS (SELECT 1 FROM jersey.orders WHERE player_id = p_id AND order_status <> 'cancelled') THEN
    RAISE EXCEPTION 'This player has an order. Cancel the order first, or hide the player instead.';
  END IF;
  DELETE FROM jersey.players WHERE id = p_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.jersey_admin_verify_payment(p_id BIGINT, p_received_amount NUMERIC DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE result jersey.orders;
BEGIN
  PERFORM jersey.require_admin();
  UPDATE jersey.orders SET
    payment_status = 'verified',
    payment_received_amount = coalesce(p_received_amount, amount),
    payment_verified_at = now(),
    payment_verified_by = auth.jwt()->>'email',
    payment_rejection_reason = NULL,
    order_status = CASE WHEN order_status IN ('new','payment_submitted') THEN 'confirmed' ELSE order_status END
  WHERE id = p_id
  RETURNING * INTO result;
  IF result.id IS NULL THEN RAISE EXCEPTION 'Order not found'; END IF;
  RETURN jersey.order_json(result);
END;
$$;

CREATE OR REPLACE FUNCTION public.jersey_admin_reject_payment(p_id BIGINT, p_reason TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE result jersey.orders;
BEGIN
  PERFORM jersey.require_admin();
  IF nullif(trim(coalesce(p_reason, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Please give a reason so the parent knows what to fix';
  END IF;
  UPDATE jersey.orders SET
    payment_status = 'rejected',
    payment_rejection_reason = trim(p_reason),
    payment_received_amount = NULL,
    payment_verified_at = NULL,
    payment_verified_by = auth.jwt()->>'email',
    order_status = CASE WHEN order_status IN ('payment_submitted','confirmed') THEN 'new' ELSE order_status END
  WHERE id = p_id
  RETURNING * INTO result;
  IF result.id IS NULL THEN RAISE EXCEPTION 'Order not found'; END IF;
  RETURN jersey.order_json(result);
END;
$$;

CREATE OR REPLACE FUNCTION public.jersey_admin_reopen_payment(p_id BIGINT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE result jersey.orders;
BEGIN
  PERFORM jersey.require_admin();
  UPDATE jersey.orders SET
    payment_status = CASE WHEN payment_proof IS NOT NULL THEN 'submitted' ELSE 'pending' END,
    payment_method = CASE WHEN payment_method = 'Cash' THEN NULL ELSE payment_method END,
    payment_reference = CASE WHEN payment_method = 'Cash' THEN NULL ELSE payment_reference END,
    payment_received_amount = NULL,
    payment_verified_at = NULL,
    payment_verified_by = NULL,
    payment_rejection_reason = NULL,
    order_status = CASE
      WHEN order_status IN ('new','confirmed') AND payment_proof IS NOT NULL THEN 'payment_submitted'
      WHEN order_status = 'confirmed' THEN 'new'
      ELSE order_status END
  WHERE id = p_id
  RETURNING * INTO result;
  IF result.id IS NULL THEN RAISE EXCEPTION 'Order not found'; END IF;
  RETURN jersey.order_json(result);
END;
$$;

-- Cash paid at the school office. Creates the order if the parent never placed one.
CREATE OR REPLACE FUNCTION public.jersey_admin_record_cash(
  p_player_id UUID, p_received_amount NUMERIC, p_jersey_size TEXT DEFAULT NULL, p_note TEXT DEFAULT NULL
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
  WHERE player_id = pl.id AND order_status <> 'cancelled' FOR UPDATE;

  IF existing.id IS NOT NULL THEN
    IF existing.payment_status = 'verified' THEN
      RAISE EXCEPTION 'This order is already paid and verified';
    END IF;
    UPDATE jersey.orders SET
      jersey_size = coalesce(nullif(trim(p_jersey_size), ''), jersey_size),
      payment_method = 'Cash',
      payment_status = 'verified',
      payment_received_amount = p_received_amount,
      payment_reference = nullif(trim(coalesce(p_note, '')), ''),
      payment_verified_at = now(),
      payment_verified_by = auth.jwt()->>'email',
      payment_rejection_reason = NULL,
      order_status = CASE WHEN order_status IN ('new','payment_submitted') THEN 'confirmed' ELSE order_status END
    WHERE id = existing.id
    RETURNING * INTO result;
  ELSE
    INSERT INTO jersey.orders (
      order_id, access_token, player_id, player_name, class_name, jersey_number, print_name,
      jersey_size, amount, payment_status, payment_method, payment_reference,
      payment_received_amount, payment_verified_at, payment_verified_by, order_status
    ) VALUES (
      'MMS-' || to_char(now(), 'YY') || '-' || nextval('jersey.order_seq'),
      encode(extensions.gen_random_bytes(24), 'hex'),
      pl.id, pl.full_name, pl.class_name, pl.jersey_number, pl.print_name,
      coalesce(nullif(trim(p_jersey_size), ''), pl.jersey_size, '—'), cfg.unit_price, 'verified', 'Cash',
      nullif(trim(coalesce(p_note, '')), ''), p_received_amount, now(), auth.jwt()->>'email', 'confirmed'
    )
    RETURNING * INTO result;
  END IF;
  RETURN jersey.order_json(result);
END;
$$;

-- Admin uploaded a screenshot the parent sent another way (for example WhatsApp).
CREATE OR REPLACE FUNCTION public.jersey_admin_set_proof(p_id BIGINT, p_path TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE result jersey.orders;
BEGIN
  PERFORM jersey.require_admin();
  IF NOT EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id = 'jersey-proofs' AND name = p_path) THEN
    RAISE EXCEPTION 'Screenshot upload not found';
  END IF;
  UPDATE jersey.orders SET
    payment_proof = p_path,
    payment_status = CASE WHEN payment_status IN ('pending','rejected') THEN 'submitted' ELSE payment_status END,
    payment_submitted_at = CASE WHEN payment_status IN ('pending','rejected') THEN now() ELSE payment_submitted_at END,
    payment_rejection_reason = CASE WHEN payment_status IN ('pending','rejected') THEN NULL ELSE payment_rejection_reason END,
    order_status = CASE WHEN order_status = 'new' THEN 'payment_submitted' ELSE order_status END
  WHERE id = p_id
  RETURNING * INTO result;
  IF result.id IS NULL THEN RAISE EXCEPTION 'Order not found'; END IF;
  RETURN jersey.order_json(result);
END;
$$;

CREATE OR REPLACE FUNCTION public.jersey_admin_update_order(p_id BIGINT, p_order_status TEXT, p_admin_notes TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE result jersey.orders;
BEGIN
  PERFORM jersey.require_admin();
  UPDATE jersey.orders SET
    order_status = coalesce(p_order_status, order_status),
    admin_notes = p_admin_notes
  WHERE id = p_id
  RETURNING * INTO result;
  IF result.id IS NULL THEN RAISE EXCEPTION 'Order not found'; END IF;
  RETURN jersey.order_json(result);
END;
$$;

CREATE OR REPLACE FUNCTION public.jersey_admin_delete_order(p_id BIGINT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  PERFORM jersey.require_admin();
  DELETE FROM jersey.orders WHERE id = p_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.jersey_admin_save_settings(p JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  PERFORM jersey.require_admin();
  UPDATE jersey.settings SET
    season_label = coalesce(p->>'season_label', season_label),
    unit_price = coalesce((p->>'unit_price')::NUMERIC, unit_price),
    sizes = coalesce(ARRAY(SELECT trim(x) FROM jsonb_array_elements_text(p->'sizes') x WHERE trim(x) <> ''), sizes),
    parents_can_change_size = coalesce((p->>'parents_can_change_size')::BOOLEAN, parents_can_change_size),
    orders_open = coalesce((p->>'orders_open')::BOOLEAN, orders_open),
    upi_id = coalesce(trim(p->>'upi_id'), upi_id),
    payee_name = coalesce(trim(p->>'payee_name'), payee_name),
    bank_account_name = coalesce(trim(p->>'bank_account_name'), bank_account_name),
    bank_account_number = coalesce(trim(p->>'bank_account_number'), bank_account_number),
    bank_name = coalesce(trim(p->>'bank_name'), bank_name),
    bank_ifsc = coalesce(upper(trim(p->>'bank_ifsc')), bank_ifsc),
    bank_branch = coalesce(trim(p->>'bank_branch'), bank_branch),
    contact_note = coalesce(trim(p->>'contact_note'), contact_note),
    updated_at = now()
  WHERE id = 1;
  RETURN public.jersey_get_settings();
END;
$$;

-- 5. Function permissions -----------------------------------------------------

DO $$
DECLARE f RECORD;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure AS sig, p.proname
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE (n.nspname = 'public' AND p.proname LIKE 'jersey\_%') OR n.nspname = 'jersey'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', f.sig);
    IF f.proname IN ('jersey_get_settings','jersey_list_players','jersey_place_order','jersey_get_order','jersey_is_admin') THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon, authenticated', f.sig);
    ELSIF f.proname LIKE 'jersey\_admin\_%' THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f.sig);
    END IF;
  END LOOP;
END;
$$;

-- 6. Payment screenshot storage ------------------------------------------------
-- Private bucket: parents can upload, only jersey admins can open the files.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('jersey-proofs', 'jersey-proofs', false, 5242880,
        ARRAY['image/jpeg','image/png','image/webp','image/heic','image/heif','application/pdf'])
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Jersey: anyone can upload a payment screenshot" ON storage.objects;
CREATE POLICY "Jersey: anyone can upload a payment screenshot"
  ON storage.objects FOR INSERT TO anon, authenticated
  WITH CHECK (bucket_id = 'jersey-proofs' AND name LIKE 'proofs/%');

DROP POLICY IF EXISTS "Jersey: admins can view payment screenshots" ON storage.objects;
CREATE POLICY "Jersey: admins can view payment screenshots"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'jersey-proofs' AND public.jersey_is_admin());

NOTIFY pgrst, 'reload schema';
