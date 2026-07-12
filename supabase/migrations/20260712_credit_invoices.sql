-- Creditnota's (wayfinder-ticket 006, datamodel uit ticket 002)
-- Creditnota = gewone invoices-rij met credited_invoice_id gevuld en negatieve bedragen.
-- De delete-guard-trigger komt in de verwijder-slice (ticket 007).

-- 1+2: koppelkolom + teken-CHECK (debet >= 0, credit <= 0)
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS credited_invoice_id uuid REFERENCES invoices(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS credit_reason text;

ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_sign_matches_type;
ALTER TABLE invoices ADD CONSTRAINT invoices_sign_matches_type CHECK (
  (credited_invoice_id IS NULL     AND subtotal_cents >= 0 AND btw_cents >= 0 AND total_cents >= 0) OR
  (credited_invoice_id IS NOT NULL AND subtotal_cents <= 0 AND btw_cents <= 0 AND total_cents <= 0)
);

-- 6: max één debetfactuur per order → .maybeSingle() blijft betrouwbaar
CREATE UNIQUE INDEX IF NOT EXISTS invoices_one_debit_per_order
  ON invoices(order_id) WHERE credited_invoice_id IS NULL;

-- 3: regel-snapshot voor álle nieuwe facturen (debet én credit);
-- dicht het gat dat order_lines ná facturatie nog muteerbaar zijn
CREATE TABLE IF NOT EXISTS invoice_lines (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id       uuid NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  order_line_id    uuid REFERENCES order_lines(id) ON DELETE SET NULL, -- herkomst; NULL bij vrij bedrag
  line_tag         text NOT NULL DEFAULT 'Staal',  -- 'Collectie' | 'Bundel' | 'Staal' (BillingRow.tag)
  description      text NOT NULL,
  article_number   text,
  dimension_name   text,
  quantity         numeric NOT NULL DEFAULT 1,
  unit_price_cents integer,
  amount_cents     integer NOT NULL,          -- negatief op creditnota's
  position         integer NOT NULL DEFAULT 0,
  created_at       timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS invoice_lines_invoice_id_idx ON invoice_lines(invoice_id);

-- RLS: SELECT-only voor authenticated (eindbeeld ticket 003); schrijven alleen via service-role-routes
ALTER TABLE invoice_lines ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS invoice_lines_select ON invoice_lines;
CREATE POLICY invoice_lines_select ON invoice_lines FOR SELECT TO authenticated USING (true);

-- 7: atomaire credit-RPC — alle inhoudelijke guards leven hier
CREATE OR REPLACE FUNCTION create_credit_invoice(
  p_invoice_id uuid,
  p_line_credits jsonb DEFAULT NULL,        -- [{"invoice_line_id": "...", "quantity": 2}] (volle regel = volledig aantal)
  p_free_amount_cents integer DEFAULT NULL, -- positief; teken zet de RPC zelf
  p_free_amount_incl_btw boolean DEFAULT false,
  p_free_description text DEFAULT NULL,
  p_reason text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_orig       invoices%ROWTYPE;
  v_line       invoice_lines%ROWTYPE;
  v_lc         jsonb;
  v_qty        numeric;
  v_amount     integer;
  v_subtotal   integer := 0;
  v_btw        integer;
  v_total      integer;
  v_existing   integer;
  v_credit_id  uuid := gen_random_uuid();
  v_pos        integer := 0;
  v_seen       uuid[] := '{}';
BEGIN
  -- precies één modus
  IF (p_line_credits IS NOT NULL) = (p_free_amount_cents IS NOT NULL) THEN
    RAISE EXCEPTION 'Kies precies één creditmodus: regels of vrij bedrag.';
  END IF;

  SELECT * INTO v_orig FROM invoices WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Factuur niet gevonden.';
  END IF;
  IF v_orig.credited_invoice_id IS NOT NULL THEN
    RAISE EXCEPTION 'Een creditnota kan niet gecrediteerd worden — crediteer de originele factuur.';
  END IF;

  -- header eerst (FK-doel voor de regel-inserts); definitieve bedragen volgen onderaan.
  -- Bij een latere RAISE rolt alles terug; next_invoice_number() is MAX+1, dus geen nummergat.
  INSERT INTO invoices (id, invoice_number, order_id, client_id, btw_pct, invoice_date,
                        subtotal_cents, btw_cents, total_cents, credited_invoice_id, credit_reason)
  VALUES (v_credit_id, next_invoice_number(), v_orig.order_id, v_orig.client_id, v_orig.btw_pct,
          CURRENT_DATE, 0, 0, 0, p_invoice_id, NULLIF(TRIM(p_reason), ''));

  IF p_line_credits IS NOT NULL THEN
    -- modus: hele regels / deelcredit per aantal
    IF jsonb_typeof(p_line_credits) <> 'array' OR jsonb_array_length(p_line_credits) = 0 THEN
      RAISE EXCEPTION 'Geen regels opgegeven om te crediteren.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM invoice_lines WHERE invoice_id = p_invoice_id) THEN
      RAISE EXCEPTION 'Deze factuur heeft nog geen regel-snapshot; crediteer via vrij bedrag.';
    END IF;

    FOR v_lc IN SELECT * FROM jsonb_array_elements(p_line_credits) LOOP
      SELECT * INTO v_line FROM invoice_lines
        WHERE id = (v_lc->>'invoice_line_id')::uuid AND invoice_id = p_invoice_id;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Factuurregel % hoort niet bij deze factuur.', v_lc->>'invoice_line_id';
      END IF;
      IF v_line.id = ANY(v_seen) THEN
        RAISE EXCEPTION 'Factuurregel "%" is dubbel opgegeven.', v_line.description;
      END IF;
      v_seen := array_append(v_seen, v_line.id);
      IF v_line.amount_cents < 0 THEN
        RAISE EXCEPTION 'Regel "%" heeft een negatief bedrag en kan niet per regel gecrediteerd worden — gebruik vrij bedrag.', v_line.description;
      END IF;
      v_qty := (v_lc->>'quantity')::numeric;
      IF v_qty IS NULL OR v_qty <= 0 OR v_qty > v_line.quantity THEN
        RAISE EXCEPTION 'Ongeldig aantal voor regel "%": maximaal %.', v_line.description, v_line.quantity;
      END IF;
      -- volle regel exact, deelcredit pro-rata op het regelbedrag
      v_amount := CASE WHEN v_qty = v_line.quantity THEN v_line.amount_cents
                       ELSE ROUND(v_line.amount_cents * v_qty / v_line.quantity)::integer END;
      v_subtotal := v_subtotal - v_amount;
      v_pos := v_pos + 1;
      INSERT INTO invoice_lines (invoice_id, order_line_id, line_tag, description, article_number,
                                 dimension_name, quantity, unit_price_cents, amount_cents, position)
      VALUES (v_credit_id, v_line.order_line_id, v_line.line_tag, v_line.description, v_line.article_number,
              v_line.dimension_name, v_qty, v_line.unit_price_cents, -v_amount, v_pos);
    END LOOP;

    -- volledige credit → exact de geboekte totalen spiegelen (geen afrondingsdrift)
    IF v_subtotal = -v_orig.subtotal_cents THEN
      v_btw   := -v_orig.btw_cents;
      v_total := -v_orig.total_cents;
    ELSE
      v_btw   := -ROUND(-v_subtotal * v_orig.btw_pct / 100.0)::integer;
      v_total := v_subtotal + v_btw;
    END IF;
  ELSE
    -- modus: vrij bedrag
    IF p_free_amount_cents <= 0 THEN
      RAISE EXCEPTION 'Het creditbedrag moet groter dan nul zijn.';
    END IF;
    IF COALESCE(TRIM(p_free_description), '') = '' THEN
      RAISE EXCEPTION 'Een omschrijving is verplicht bij een vrij creditbedrag.';
    END IF;
    IF p_free_amount_incl_btw THEN
      v_total    := -p_free_amount_cents;
      v_subtotal := -ROUND(p_free_amount_cents / (1 + v_orig.btw_pct / 100.0))::integer;
      v_btw      := v_total - v_subtotal;
    ELSE
      v_subtotal := -p_free_amount_cents;
      v_btw      := -ROUND(p_free_amount_cents * v_orig.btw_pct / 100.0)::integer;
      v_total    := v_subtotal + v_btw;
    END IF;
    INSERT INTO invoice_lines (invoice_id, description, quantity, amount_cents, position)
    VALUES (v_credit_id, TRIM(p_free_description), 1, v_subtotal, 1);
  END IF;

  -- limiet: som |credits| <= |debet| + 1 cent (FOR UPDATE hierboven serialiseert de race)
  SELECT COALESCE(SUM(total_cents), 0) INTO v_existing
  FROM invoices WHERE credited_invoice_id = p_invoice_id AND id <> v_credit_id;
  IF -(v_existing + v_total) > v_orig.total_cents + 1 THEN
    RAISE EXCEPTION 'Creditbedrag overschrijdt het resterende factuurbedrag (resteert € %).',
      TO_CHAR((v_orig.total_cents + v_existing) / 100.0, 'FM999G990D00');
  END IF;

  UPDATE invoices
  SET subtotal_cents = v_subtotal, btw_cents = v_btw, total_cents = v_total
  WHERE id = v_credit_id;

  RETURN v_credit_id;
END;
$$;

-- rol-gate zit in de API-route; de RPC is niet direct aanroepbaar voor clients
REVOKE ALL ON FUNCTION create_credit_invoice(uuid, jsonb, integer, boolean, text, text) FROM PUBLIC, anon, authenticated;
