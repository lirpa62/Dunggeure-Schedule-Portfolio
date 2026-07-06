-- ============================================
-- 공지 템플릿
-- ============================================

CREATE TABLE IF NOT EXISTS notice_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notice_templates_sort_order
  ON notice_templates(sort_order, created_at);

ALTER TABLE notice_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "notice_templates_public_read" ON notice_templates;
CREATE POLICY "notice_templates_public_read"
  ON notice_templates FOR SELECT USING (true);
-- 쓰기는 service_role 키로 우회 (API에서 admin 검증)

INSERT INTO notice_templates (title, content, sort_order)
SELECT seed.title, seed.content, seed.sort_order
FROM (
  VALUES
    (
      '월간 안내',
      '이번 달 둥그레 방송 일정 안내입니다.' || E'\n' ||
      '일정은 상황에 따라 변경될 수 있으며, 변경 시 일정표에 반영됩니다.',
      0
    ),
    (
      '일정 변경',
      '방송 일정이 일부 변경되었습니다.' || E'\n' ||
      '변경된 일정은 캘린더에서 확인해 주세요.',
      1
    ),
    (
      '휴방 안내',
      '휴방 일정이 있습니다.' || E'\n' ||
      '자세한 날짜와 시간은 일정표를 확인해 주세요.',
      2
    ),
    (
      '대회 안내',
      '이번 달 대회 일정이 예정되어 있습니다.' || E'\n' ||
      '참가/중계 일정은 캘린더에 순차적으로 반영됩니다.',
      3
    ),
    (
      '합방 안내',
      '합방 일정이 포함되어 있습니다.' || E'\n' ||
      '함께하는 멤버와 상세 내용은 각 일정에서 확인해 주세요.',
      4
    ),
    (
      '방송 시간 안내',
      '방송 시간은 당일 상황에 따라 조정될 수 있습니다.' || E'\n' ||
      '최신 일정은 캘린더 기준으로 확인해 주세요.',
      5
    )
) AS seed(title, content, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM notice_templates);
