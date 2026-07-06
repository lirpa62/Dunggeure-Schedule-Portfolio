-- ============================================
-- 일정 수동 정렬 최적화
-- ============================================
-- 일정표는 드래그로 저장한 sort_order를 날짜 안의 최종 표시 순서로 사용합니다.

CREATE INDEX IF NOT EXISTS idx_schedules_date_sort_order
ON schedules(date, sort_order, created_at);
