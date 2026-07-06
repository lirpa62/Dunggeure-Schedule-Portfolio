-- ============================================
-- 데코 원본 이미지 보관 경로
-- ============================================

ALTER TABLE calendar_decorations
  ADD COLUMN IF NOT EXISTS original_image_url TEXT,
  ADD COLUMN IF NOT EXISTS original_storage_path TEXT;
