-- ============================================
-- 월별 공지: 캘린더 상단에 admin이 작성하는 짧은 공지글 (한 달 1개)
-- ============================================

CREATE TABLE IF NOT EXISTS monthly_notices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_year INT NOT NULL,
  owner_month INT NOT NULL,        -- 1~12
  content TEXT NOT NULL,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(owner_year, owner_month)
);

ALTER TABLE monthly_notices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "monthly_notices_public_read" ON monthly_notices;
CREATE POLICY "monthly_notices_public_read"
  ON monthly_notices FOR SELECT USING (true);
-- 쓰기는 service_role 키로 우회 (API에서 admin 검증)
