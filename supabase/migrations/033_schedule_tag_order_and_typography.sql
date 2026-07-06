-- ============================================
-- 일정 태그 표시 순서 및 타이포그래피 옵션
-- ============================================

ALTER TABLE schedule_tags
  ADD COLUMN IF NOT EXISTS font_size INTEGER,
  ADD COLUMN IF NOT EXISTS text_align TEXT DEFAULT 'center'
    CHECK (text_align IN ('left', 'center', 'right')),
  ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;

WITH ordered_tags AS (
  SELECT id, row_number() OVER (ORDER BY name, created_at) - 1 AS next_order
  FROM schedule_tags
)
UPDATE schedule_tags
SET sort_order = ordered_tags.next_order
FROM ordered_tags
WHERE schedule_tags.id = ordered_tags.id;

CREATE INDEX IF NOT EXISTS idx_schedule_tags_sort_order
  ON schedule_tags(sort_order, created_at);
