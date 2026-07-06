-- ============================================
-- 외부 로그인 사용자 식별자 제거
-- - 관리자 로컬 로그인만 사용
-- - 기존 DB에 남아 있을 수 있는 외부 로그인 컬럼/제약 정리
-- ============================================

DELETE FROM users WHERE provider <> 'local';

ALTER TABLE users DROP CONSTRAINT IF EXISTS user_identity_check;
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_naver_id_unique;
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_provider_check;

ALTER TABLE users DROP COLUMN IF EXISTS naver_id;

UPDATE users SET provider = 'local' WHERE provider IS DISTINCT FROM 'local';

ALTER TABLE users ALTER COLUMN provider SET DEFAULT 'local';
ALTER TABLE users ADD CONSTRAINT users_provider_check CHECK (provider = 'local');
ALTER TABLE users ADD CONSTRAINT user_identity_check CHECK (
  provider = 'local' AND username IS NOT NULL
);
