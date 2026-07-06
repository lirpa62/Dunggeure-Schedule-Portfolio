-- ============================================
-- 태그 보호 + 일정 메타데이터
-- ============================================

-- 1. schedule_tags: 보호 플래그 (관리자도 기본 태그 삭제 불가)
ALTER TABLE schedule_tags
ADD COLUMN IF NOT EXISTS is_protected BOOLEAN NOT NULL DEFAULT false;

UPDATE schedule_tags SET is_protected = true WHERE name IN ('방송', '게임', '합방', '공지', '휴방');

-- 2. schedules: 일정별 추가 메타
ALTER TABLE schedules
ADD COLUMN IF NOT EXISTS meta JSONB NOT NULL DEFAULT '{}'::jsonb;
