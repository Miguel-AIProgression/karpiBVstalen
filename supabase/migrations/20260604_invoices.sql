-- Facturen tabel voor Stalen-systeem
-- Eigen nummerreeks STL-YYYY-NNN, los van ERP-facturen
CREATE TABLE IF NOT EXISTS invoices (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number  text NOT NULL UNIQUE,         -- STL-2026-001
  order_id        uuid NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  client_id       uuid NOT NULL REFERENCES clients(id),
  btw_pct         integer NOT NULL DEFAULT 21 CHECK (btw_pct IN (0, 9, 21)),
  invoice_date    date NOT NULL DEFAULT CURRENT_DATE,
  subtotal_cents  integer NOT NULL DEFAULT 0,   -- excl. BTW
  btw_cents       integer NOT NULL DEFAULT 0,
  total_cents     integer NOT NULL DEFAULT 0,   -- incl. BTW
  sent_at         timestamptz,                  -- null = nog niet gemaild
  created_at      timestamptz DEFAULT now()
);

ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY invoices_auth ON invoices FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Veilige sequentiële nummergeneratie
-- advisory lock serialiseert gelijktijdige aanvragen; MAX query reset automatisch per jaar
CREATE OR REPLACE FUNCTION next_invoice_number()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  year_str text := to_char(CURRENT_DATE, 'YYYY');
  seq_val  int;
BEGIN
  PERFORM pg_advisory_xact_lock(424242);
  SELECT COALESCE(
    MAX(CAST(SPLIT_PART(invoice_number, '-', 3) AS int)), 0
  ) + 1
  INTO seq_val
  FROM invoices
  WHERE invoice_number LIKE 'STL-' || year_str || '-%';
  RETURN 'STL-' || year_str || '-' || LPAD(seq_val::text, 3, '0');
END;
$$;
