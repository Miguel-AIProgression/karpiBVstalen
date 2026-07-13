-- ICL (intracommunautaire levering) + herfactureren-na-volledige-credit (besluit Miguel 13-07).
-- 1. clients.vat_number: EU-btw-nummer van de afnemer (basis voor 0%-default + PDF-vrijstellingsregel).
-- 2. Vervang-model: een volledig gecrediteerde debetfactuur kan expliciet vervangen worden
--    (superseded_at); pas dan staat de partial UNIQUE een nieuwe debetfactuur op de order toe.

ALTER TABLE clients ADD COLUMN IF NOT EXISTS vat_number text;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS superseded_at timestamptz;

-- dé actieve debetfactuur van een order = niet-credit én niet-vervangen
DROP INDEX IF EXISTS invoices_one_debit_per_order;
CREATE UNIQUE INDEX invoices_one_debit_per_order
  ON invoices(order_id) WHERE credited_invoice_id IS NULL AND superseded_at IS NULL;

-- Vervangen kan uitsluitend als de factuur volledig gecrediteerd is (marge €0,01).
CREATE OR REPLACE FUNCTION supersede_invoice(p_invoice_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_inv invoices%ROWTYPE;
  v_credited integer;
BEGIN
  SELECT * INTO v_inv FROM invoices WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Factuur niet gevonden.';
  END IF;
  IF v_inv.credited_invoice_id IS NOT NULL THEN
    RAISE EXCEPTION 'Een creditnota kan niet vervangen worden.';
  END IF;
  IF v_inv.superseded_at IS NOT NULL THEN
    RAISE EXCEPTION 'Factuur % is al vervangen.', v_inv.invoice_number;
  END IF;
  SELECT COALESCE(SUM(total_cents), 0) INTO v_credited
  FROM invoices WHERE credited_invoice_id = p_invoice_id;
  IF v_credited = 0 THEN
    RAISE EXCEPTION 'Factuur % heeft geen creditnota — vervangen kan alleen na volledige creditering.', v_inv.invoice_number;
  END IF;
  IF ABS(v_inv.total_cents + v_credited) > 1 THEN
    RAISE EXCEPTION 'Factuur % is niet volledig gecrediteerd (resteert € %) — vervang kan alleen na volledige creditering.',
      v_inv.invoice_number, TO_CHAR((v_inv.total_cents + v_credited) / 100.0, 'FM999G990D00');
  END IF;
  UPDATE invoices SET superseded_at = now() WHERE id = p_invoice_id;
END;
$$;

REVOKE ALL ON FUNCTION supersede_invoice(uuid) FROM PUBLIC, anon, authenticated;
