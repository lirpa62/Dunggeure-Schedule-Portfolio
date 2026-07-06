-- Allow admins to manage sticker categories without code changes.
CREATE TABLE IF NOT EXISTS sticker_categories (
  value TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

INSERT INTO sticker_categories (value, label, sort_order, is_default)
VALUES
  ('dunggeure', '둥그레', 0, true),
  ('game', '게임', 1, true),
  ('football', '축구', 2, true),
  ('server', '서버', 3, true),
  ('etc', '기타', 4, true)
ON CONFLICT (value) DO UPDATE
SET
  label = EXCLUDED.label,
  sort_order = EXCLUDED.sort_order,
  is_default = EXCLUDED.is_default;

CREATE INDEX IF NOT EXISTS idx_sticker_categories_sort
  ON sticker_categories(sort_order, created_at);

ALTER TABLE sticker_categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "sticker_categories_public_read" ON sticker_categories;
CREATE POLICY "sticker_categories_public_read"
  ON sticker_categories FOR SELECT USING (true);
