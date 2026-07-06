-- Global sticker favorites for the admin sticker picker.
CREATE TABLE IF NOT EXISTS sticker_favorites (
  sticker_id UUID PRIMARY KEY REFERENCES stickers(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sticker_favorites_created_at
  ON sticker_favorites(created_at DESC);

ALTER TABLE sticker_favorites ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "sticker_favorites_public_read" ON sticker_favorites;
CREATE POLICY "sticker_favorites_public_read"
  ON sticker_favorites FOR SELECT USING (true);
