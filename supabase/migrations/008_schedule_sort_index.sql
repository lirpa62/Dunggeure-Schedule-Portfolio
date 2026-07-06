-- ============================================
-- 일정 정렬 최적화
-- ============================================
-- sort_order는 (date, time) 그룹 내에서의 순서를 의미합니다.
-- 시간이 같으면 sort_order로 정렬, 그 외에는 time 우선 정렬됩니다.
-- (time NULL → ASC NULLS LAST 정책으로 시간 있는 일정이 먼저 표시)

CREATE INDEX IF NOT EXISTS idx_schedules_date_time_order
ON schedules(date, time NULLS LAST, sort_order);
