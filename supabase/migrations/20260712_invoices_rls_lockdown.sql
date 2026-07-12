-- RLS-lockdown op invoices (wayfinder-ticket 007, ticket 003-besluit).
-- invoices_auth (mig 20260604) stond nog ALL (select+insert+update+delete) toe
-- aan elke ingelogde gebruiker. Schrijven hoort uitsluitend te lopen via de
-- service-role-routes (create/csv/email/credit/[id]-DELETE), die zelf al
-- requireRole(["sales","admin"]) afdwingen. Deze migratie beperkt de
-- authenticated-rol tot lezen; schrijven via anon/authenticated-sleutels is
-- daarna niet meer mogelijk (net als invoice_lines_select, mig 20260712_credit_invoices.sql).
--
-- NIET UITGEVOERD — alleen geschreven, idempotent t.o.v. eerdere runs.

DROP POLICY IF EXISTS invoices_auth ON invoices;
DROP POLICY IF EXISTS invoices_select ON invoices;

CREATE POLICY invoices_select ON invoices FOR SELECT TO authenticated USING (true);
