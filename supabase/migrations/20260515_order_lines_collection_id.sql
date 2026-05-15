-- Voeg collection_id toe aan order_lines zodat de collectie-koppeling eenduidig is.
-- Voorheen werd de collectienaam afgeleid via collection_bundles (many-to-many),
-- waardoor een bundel in meerdere collecties kon leiden tot de verkeerde collectieheader.
ALTER TABLE order_lines
  ADD COLUMN IF NOT EXISTS collection_id uuid REFERENCES collections(id) ON DELETE SET NULL;
