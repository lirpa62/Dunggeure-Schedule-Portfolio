import 'server-only';
import { createClient as createServiceClient } from '@supabase/supabase-js';

export const createAdminClient = () =>
  createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
