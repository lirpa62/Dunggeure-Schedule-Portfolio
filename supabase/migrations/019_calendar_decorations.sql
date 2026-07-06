-- ============================================
-- 캘린더 데코 이미지
-- "이 달의 캘린더 화면용" 데코 — 같은 셀이 다른 달 캘린더에서 보일 때는 영향 없음.
-- 데코가 있는 셀은 그 달의 캘린더에서 일정 표시를 가린다 (일정 데이터는 그대로).
-- ============================================

CREATE TABLE IF NOT EXISTS calendar_decorations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_year INT NOT NULL,        -- 이 데코가 보이는 캘린더의 연도
  owner_month INT NOT NULL,       -- 이 데코가 보이는 캘린더의 월 (1~12)
  cell_date DATE NOT NULL,        -- 데코를 두는 셀의 날짜 (이전/다음 달 일자 포함 가능)
  image_url TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  -- 한 캘린더 화면의 한 셀에는 데코 1개만 (덮어쓰기는 기존 삭제 후 새로)
  UNIQUE(owner_year, owner_month, cell_date)
);

CREATE INDEX IF NOT EXISTS idx_calendar_decorations_owner
  ON calendar_decorations(owner_year, owner_month);

ALTER TABLE calendar_decorations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "calendar_decorations_public_read" ON calendar_decorations;
CREATE POLICY "calendar_decorations_public_read"
  ON calendar_decorations FOR SELECT USING (true);
-- 쓰기는 service_role 키로 우회 (API에서 admin 검증)
