-- Enable realtime change events for schedules and memo board entries.
ALTER TABLE schedules REPLICA IDENTITY FULL;
ALTER TABLE memos REPLICA IDENTITY FULL;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE schedules;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE memos;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

