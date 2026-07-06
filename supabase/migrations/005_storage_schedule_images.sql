-- ============================================
-- Storage: 일정 이미지 업로드용 버킷
-- ============================================

-- 1. 공개 버킷 생성 (이미 있으면 무시)
INSERT INTO storage.buckets (id, name, public)
VALUES ('schedule-images', 'schedule-images', true)
ON CONFLICT (id) DO NOTHING;

-- 2. 읽기 정책: 누구나 (public 버킷)
DROP POLICY IF EXISTS "schedule_images_public_read" ON storage.objects;
CREATE POLICY "schedule_images_public_read"
ON storage.objects FOR SELECT
USING (bucket_id = 'schedule-images');

-- 3. 쓰기/수정/삭제는 service_role 키로 우회 (API에서 admin 검증)
-- → 별도 RLS 정책 불필요. anon/authenticated 키로는 못 쓰게 막아둠.
