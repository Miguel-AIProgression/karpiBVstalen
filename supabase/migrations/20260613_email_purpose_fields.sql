-- Doel-specifieke e-mailadressen op klant- en orderniveau
-- email_order_confirmation → voor orderbevestigingen
-- email_invoice           → voor facturen

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS email_order_confirmation text,
  ADD COLUMN IF NOT EXISTS email_invoice text;

-- Bestaande contact_email overnemen als startwaarde
UPDATE clients
SET
  email_order_confirmation = contact_email,
  email_invoice            = contact_email
WHERE contact_email IS NOT NULL
  AND email_order_confirmation IS NULL;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS email_order_confirmation text,
  ADD COLUMN IF NOT EXISTS email_invoice text;

-- Bestaande orders.email overnemen als startwaarde
UPDATE orders
SET
  email_order_confirmation = email,
  email_invoice            = email
WHERE email IS NOT NULL
  AND email_order_confirmation IS NULL;
