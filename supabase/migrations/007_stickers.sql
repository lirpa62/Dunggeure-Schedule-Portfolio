-- ============================================
-- 스티커: 일정 입력 시 선택 가능한 이미지
-- ============================================

-- 1. 메타데이터 테이블
CREATE TABLE IF NOT EXISTS stickers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT NOT NULL,        -- dunggeure, game, football, etc
  name TEXT NOT NULL,            -- 표시용 라벨
  url TEXT NOT NULL,             -- 공개 Storage URL
  storage_path TEXT NOT NULL,    -- 삭제 시 사용할 버킷 내부 경로
  sort_order INT DEFAULT 0,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stickers_category ON stickers(category);

ALTER TABLE stickers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "stickers_public_read" ON stickers;
CREATE POLICY "stickers_public_read" ON stickers FOR SELECT USING (true);
-- 쓰기는 service_role 키로 우회 (API에서 admin 검증)

-- 2. Storage 버킷
INSERT INTO storage.buckets (id, name, public)
VALUES ('stickers', 'stickers', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "stickers_storage_public_read" ON storage.objects;
CREATE POLICY "stickers_storage_public_read"
ON storage.objects FOR SELECT
USING (bucket_id = 'stickers');
