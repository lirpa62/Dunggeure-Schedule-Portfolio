-- ============================================
-- 캘린더 데코 캡션: 이미지 출처/설명 짧은 문구
-- ============================================

ALTER TABLE calendar_decorations
  ADD COLUMN IF NOT EXISTS caption TEXT;
