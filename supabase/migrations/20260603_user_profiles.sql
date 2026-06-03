-- Gebruikersprofiel: display naam per auth user
CREATE TABLE IF NOT EXISTS user_profiles (
  id uuid PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  display_name text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Alleen ingelogde gebruikers mogen lezen
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated can read" ON user_profiles FOR SELECT TO authenticated USING (true);

-- Bestaande 4 gebruikers
INSERT INTO user_profiles (id, display_name) VALUES
  ('ffde2d5e-7e03-47c9-b646-6ca002e1a140', 'Lotte'),
  ('111738de-d12e-434c-9df1-deb8b2dc5cef', 'PD'),
  ('168924d5-7dba-4c95-b052-7bed7c640fa8', 'Thom'),
  ('cabd12cd-470e-44a3-b210-38f245f3a677', 'Miguel')
ON CONFLICT (id) DO NOTHING;
