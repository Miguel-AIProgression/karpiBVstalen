-- Verwijder de oude unieke constraint die één bundel per order afdwong.
-- In het nieuwe systeem worden bundels uitgesplitst naar meerdere sample-regels
-- die allemaal dezelfde bundle_id dragen voor groepering in de UI.
ALTER TABLE order_lines DROP CONSTRAINT IF EXISTS order_lines_order_bundle_unique;
