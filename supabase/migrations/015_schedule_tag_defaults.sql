-- ============================================
-- 태그 기본 시간/내용 (일정 추가 시 자동 채우기용)
-- ============================================
ALTER TABLE schedule_tags
  ADD COLUMN IF NOT EXISTS default_time TEXT,
  ADD COLUMN IF NOT EXISTS default_content TEXT;
