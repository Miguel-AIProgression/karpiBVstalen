-- ============================================================
-- Bundle Items: stalen direct koppelen aan bundels (cross-quality)
-- Vervangt het oude model van bundle_colors (1 kwaliteit + kleuren)
-- ============================================================

CREATE TABLE IF NOT EXISTS bundle_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bundle_id uuid NOT NULL REFERENCES bundles(id) ON DELETE CASCADE,
  sample_id uuid NOT NULL REFERENCES samples(id),
  position integer NOT NULL DEFAULT 1,
  created_at timestamptz DEFAULT now()
);

-- Migreer bestaande bundle_colors naar bundle_items
INSERT INTO bundle_items (bundle_id, sample_id, position)
SELECT bc.bundle_id, s.id, bc.position
FROM bundle_colors bc
JOIN bundles b ON b.id = bc.bundle_id
JOIN samples s ON s.quality_id = b.quality_id
  AND s.color_code_id = bc.color_code_id
  AND s.dimension_id = b.dimension_id
  AND s.active = true
WHERE b.active = true
ON CONFLICT DO NOTHING;

-- Maak quality_id optioneel op bundles (niet meer verplicht)
ALTER TABLE bundles ALTER COLUMN quality_id DROP NOT NULL;
ALTER TABLE bundles ALTER COLUMN dimension_id DROP NOT NULL;

-- RLS policies voor bundle_items
ALTER TABLE bundle_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read bundle_items"
  ON bundle_items FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can manage bundle_items"
  ON bundle_items FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- Extras: displays, roedes, bandensets etc. in voorraad
-- Gemarkeerd als "extra" zodat er geen sticker bij hoort
-- ============================================================

CREATE TABLE IF NOT EXISTS extras (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  type text NOT NULL CHECK (type IN ('display', 'roede', 'bandenset', 'overig')),
  description text,
  min_stock integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS extras_stock (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  extra_id uuid NOT NULL REFERENCES extras(id) ON DELETE CASCADE,
  location_id uuid NOT NULL REFERENCES locations(id),
  quantity integer NOT NULL DEFAULT 0,
  UNIQUE(extra_id, location_id)
);

-- RLS policies voor extras
ALTER TABLE extras ENABLE ROW LEVEL SECURITY;
ALTER TABLE extras_stock ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read extras"
  ON extras FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can manage extras"
  ON extras FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can read extras_stock"
  ON extras_stock FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can manage extras_stock"
  ON extras_stock FOR ALL TO authenticated USING (true) WITH CHECK (true);
