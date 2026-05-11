-- RLS voor brands en sample_brands
ALTER TABLE brands       ENABLE ROW LEVEL SECURITY;
ALTER TABLE sample_brands ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS brands_authenticated_all       ON brands;
DROP POLICY IF EXISTS sample_brands_authenticated_all ON sample_brands;

CREATE POLICY brands_authenticated_all       ON brands       FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY sample_brands_authenticated_all ON sample_brands FOR ALL TO authenticated USING (true) WITH CHECK (true);
