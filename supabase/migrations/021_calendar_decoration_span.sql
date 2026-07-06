-- ============================================
-- 캘린더 데코: 가로 span (같은 주의 연속 셀 합치기)
-- cell_date = 시작 셀, span = 차지하는 셀 개수 (1~7)
-- ============================================

ALTER TABLE calendar_decorations
  ADD COLUMN IF NOT EXISTS span INT NOT NULL DEFAULT 1
  CHECK (span >= 1 AND span <= 7);
