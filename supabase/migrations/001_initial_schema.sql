-- ============================================
-- 둥그레 시간표 데이터베이스 스키마
-- ============================================

-- 1. 사용자 테이블
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  nickname TEXT UNIQUE NOT NULL,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  provider TEXT NOT NULL DEFAULT 'local' CHECK (provider IN ('local')),
  password_hash TEXT, -- admin만 사용
  must_change_password BOOLEAN DEFAULT false,
  auth_session_id UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 닉네임 길이 제한
ALTER TABLE users ADD CONSTRAINT nickname_length CHECK (char_length(nickname) <= 15);

-- 2. 일정 태그/오프셋 테이블
CREATE TABLE schedule_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,         -- 방송, 게임, 합방, 공지, 휴방 등
  bg_color TEXT NOT NULL DEFAULT '#ffffff',
  font_color TEXT NOT NULL DEFAULT '#000000',
  border_color TEXT DEFAULT '#8080ff',
  border_style TEXT DEFAULT 'none' CHECK (border_style IN ('none', 'solid', 'dashed', 'dotted', 'double')),
  font_weight TEXT DEFAULT 'normal',
  font_size INTEGER,
  text_align TEXT DEFAULT 'center' CHECK (text_align IN ('left', 'center', 'right')),
  is_italic BOOLEAN DEFAULT false,
  is_underline BOOLEAN DEFAULT false,
  is_strikethrough BOOLEAN DEFAULT false,
  is_default BOOLEAN DEFAULT false,  -- 기본 태그 여부
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 기본 태그 삽입
INSERT INTO schedule_tags (name, bg_color, font_color, is_default, sort_order) VALUES
  ('방송', '#fae3e5', '#333333', true, 0),
  ('게임', '#fff2cc', '#333333', true, 1),
  ('합방', '#fff2cc', '#333333', true, 2),
  ('공지', '#4f81bd', '#ffffff', true, 3),
  ('휴방', '#d8d8d8', '#999999', true, 4);

-- 3. 일정 테이블
CREATE TABLE schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL,
  time TEXT,                          -- "2PM", "7PM" 등
  tag_id UUID REFERENCES schedule_tags(id) ON DELETE SET NULL,
  content TEXT,
  collab_members TEXT[],              -- 합방 멤버 배열
  image_url TEXT,
  sort_order INT DEFAULT 0,          -- 같은 날 여러 일정 정렬
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_schedules_date ON schedules(date);
CREATE INDEX idx_schedules_year_month ON schedules(EXTRACT(YEAR FROM date), EXTRACT(MONTH FROM date));


-- ============================================
-- RLS (Row Level Security) 정책
-- ============================================

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedule_tags ENABLE ROW LEVEL SECURITY;

-- 읽기: 모든 사용자 (비로그인 포함)
CREATE POLICY "public_read" ON users FOR SELECT USING (true);
CREATE POLICY "public_read" ON schedules FOR SELECT USING (true);
CREATE POLICY "public_read" ON schedule_tags FOR SELECT USING (true);
CREATE POLICY "public_read" ON memos FOR SELECT USING (true);
CREATE POLICY "public_read" ON songbook FOR SELECT USING (true);
CREATE POLICY "public_read" ON recommended_songs FOR SELECT USING (true);
CREATE POLICY "public_read" ON wiki_terms FOR SELECT USING (true);
CREATE POLICY "public_read" ON wiki_questions FOR SELECT USING (true);
CREATE POLICY "public_read" ON wiki_answers FOR SELECT USING (true);

-- 메모: 본인만 작성/수정/삭제
CREATE POLICY "user_insert_memo" ON memos FOR INSERT WITH CHECK (auth.uid()::uuid = user_id);
CREATE POLICY "user_update_memo" ON memos FOR UPDATE USING (auth.uid()::uuid = user_id);
CREATE POLICY "user_delete_memo" ON memos FOR DELETE USING (auth.uid()::uuid = user_id);


-- 일정/태그: 관리자만 CUD
-- (관리자 체크는 API 라우트에서 처리 - Supabase service_role key 사용)

-- 관리자 계정 생성 (패스워드는 API에서 bcrypt 해싱 후 업데이트)
INSERT INTO users (email, nickname, role, provider, must_change_password)
VALUES ('admin@dunggeure.local', '둥그레', 'admin', 'local', true);
