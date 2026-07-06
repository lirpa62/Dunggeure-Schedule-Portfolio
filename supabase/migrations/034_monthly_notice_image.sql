-- ============================================
-- 월별 공지 이미지: 공지 우측 장식 이미지를 월별로 관리
-- ============================================

ALTER TABLE monthly_notices
  ADD COLUMN IF NOT EXISTS image_url TEXT,
  ADD COLUMN IF NOT EXISTS image_storage_path TEXT;
