-- Add an admin-only memo field for schedule tooltip notes.
ALTER TABLE schedules
  ADD COLUMN IF NOT EXISTS memo TEXT;
