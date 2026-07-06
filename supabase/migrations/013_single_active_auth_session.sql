-- Keep only one active login session per user.
-- New logins overwrite this value; existing JWTs with the old session id become invalid.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS auth_session_id UUID;
