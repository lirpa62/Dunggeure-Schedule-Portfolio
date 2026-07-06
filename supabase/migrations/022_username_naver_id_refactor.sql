-- ============================================
-- 이메일 컬럼 제거 + username 분리
-- - admin: username으로 로그인
-- - 이메일은 더 이상 수집/저장하지 않음
-- ============================================

ALTER TABLE users ADD COLUMN username TEXT;

-- 기존 admin 계정 마이그레이션 (email='admin@dunggeure.local' → username='dunggeure_admin')
UPDATE users
SET username = 'dunggeure_admin'
WHERE provider = 'local' AND email = 'admin@dunggeure.local';

ALTER TABLE users DROP COLUMN email;

ALTER TABLE users ADD CONSTRAINT users_username_unique UNIQUE (username);

ALTER TABLE users ADD CONSTRAINT user_identity_check CHECK (
  provider = 'local' AND username IS NOT NULL
);
