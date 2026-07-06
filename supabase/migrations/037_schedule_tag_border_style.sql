-- ============================================
-- 일정 태그 테두리 옵션
-- ============================================

ALTER TABLE schedule_tags
  ADD COLUMN IF NOT EXISTS border_color TEXT DEFAULT '#8080ff',
  ADD COLUMN IF NOT EXISTS border_style TEXT DEFAULT 'none'
    CHECK (border_style IN ('none', 'solid', 'dashed', 'dotted', 'double'));
