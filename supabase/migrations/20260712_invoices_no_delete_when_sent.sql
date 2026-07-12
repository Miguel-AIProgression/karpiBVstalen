-- Delete-guard (ticket 007): gemailde factuur is onverwijderbaar, ook voor service-role.
-- Stond al live (sessie 10-07); dit bestand dicht de repo<->DB-drift.
CREATE OR REPLACE FUNCTION public.invoices_block_delete_sent()
RETURNS trigger LANGUAGE plpgsql AS $function$
BEGIN
  IF OLD.sent_at IS NOT NULL THEN
    RAISE EXCEPTION 'Gemailde factuur % kan niet verwijderd worden — crediteer in plaats daarvan.', OLD.invoice_number;
  END IF;
  RETURN OLD;
END $function$;
DROP TRIGGER IF EXISTS invoices_no_delete_when_sent ON public.invoices;
CREATE TRIGGER invoices_no_delete_when_sent BEFORE DELETE ON public.invoices FOR EACH ROW EXECUTE FUNCTION invoices_block_delete_sent();
