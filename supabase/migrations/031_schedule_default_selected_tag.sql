-- ============================================
-- Schedule selected default tag
-- 일정 추가 팝업을 처음 열 때 자동 선택할 태그
-- ============================================

ALTER TABLE schedule_tags
  ADD COLUMN IF NOT EXISTS is_schedule_default BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS idx_schedule_tags_single_schedule_default
  ON schedule_tags (is_schedule_default)
  WHERE is_schedule_default = true;
