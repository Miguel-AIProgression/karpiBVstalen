-- Bijlagen per order (PDF, PNG, JPG etc.)
CREATE TABLE IF NOT EXISTS order_attachments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id    uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  file_name   text NOT NULL,
  file_path   text NOT NULL,   -- storage path: {order_id}/{uuid}_{file_name}
  file_size   integer,
  mime_type   text,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS order_attachments_order_id_idx ON order_attachments(order_id);

ALTER TABLE order_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY order_attachments_select ON order_attachments
  FOR SELECT TO authenticated USING (true);

CREATE POLICY order_attachments_insert ON order_attachments
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY order_attachments_delete ON order_attachments
  FOR DELETE TO authenticated
  USING ((auth.jwt()->'app_metadata'->>'role') = ANY(ARRAY['sales','admin']));
