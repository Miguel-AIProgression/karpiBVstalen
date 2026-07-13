-- Factuurgeschiedenis + zichtbaar ontvangeradres (feedback Nando 13-07).
-- 1. invoices.sent_to: naar welk adres de laatste mail ging (RugFlow: verstuurd_naar).
-- 2. invoice_events: append-only geschiedenis per factuur (RugFlow: order_events/Logboek).
--    Schrijven uitsluitend via de service-role-routes; authenticated mag alleen lezen.

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS sent_to text;

CREATE TABLE IF NOT EXISTS invoice_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id  uuid NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  event_type  text NOT NULL,   -- 'aangemaakt' | 'gemaild' | 'creditnota_aangemaakt' | 'vervangen'
  actor_email text,            -- wie de actie deed (JWT-e-mail); NULL bij backfill/systeem
  details     jsonb NOT NULL DEFAULT '{}'::jsonb, -- bv. {"to": "...", "bcc": "...", "credit_nr": "..."}
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS invoice_events_invoice_id_idx ON invoice_events(invoice_id, created_at);

ALTER TABLE invoice_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS invoice_events_select ON invoice_events;
CREATE POLICY invoice_events_select ON invoice_events FOR SELECT TO authenticated USING (true);

-- Backfill (idempotent): bestaand aanmaak-/mailmoment als event, zodat de
-- geschiedenis niet leeg begint. Ontvangeradres van oude mails is onbekend.
INSERT INTO invoice_events (invoice_id, event_type, details, created_at)
SELECT i.id, 'aangemaakt', '{"backfill": true}'::jsonb, i.created_at
FROM invoices i
WHERE NOT EXISTS (
  SELECT 1 FROM invoice_events e WHERE e.invoice_id = i.id AND e.event_type = 'aangemaakt'
);

INSERT INTO invoice_events (invoice_id, event_type, details, created_at)
SELECT i.id, 'gemaild', '{"backfill": true}'::jsonb, i.sent_at
FROM invoices i
WHERE i.sent_at IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM invoice_events e WHERE e.invoice_id = i.id AND e.event_type = 'gemaild'
  );

INSERT INTO invoice_events (invoice_id, event_type, details, created_at)
SELECT o.id, 'creditnota_aangemaakt',
       jsonb_build_object('credit_nr', c.invoice_number, 'backfill', true),
       c.created_at
FROM invoices c
JOIN invoices o ON o.id = c.credited_invoice_id
WHERE NOT EXISTS (
  SELECT 1 FROM invoice_events e
  WHERE e.invoice_id = o.id AND e.event_type = 'creditnota_aangemaakt'
    AND e.details->>'credit_nr' = c.invoice_number
);

-- PostgREST-schema-cache verversen zodat de nieuwe tabel direct via REST leesbaar is
NOTIFY pgrst, 'reload schema';
