-- ============================================
-- 캘린더 데코 텍스트 현수막: 이미지 없이 문구만 데코로 사용
-- ============================================

ALTER TABLE calendar_decorations
  ALTER COLUMN image_url DROP NOT NULL,
  ALTER COLUMN storage_path DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS caption_rich JSONB,
  ADD COLUMN IF NOT EXISTS caption_style JSONB;
