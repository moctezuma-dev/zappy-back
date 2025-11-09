import { createClient } from '@supabase/supabase-js';
import { env } from '../config/env.js';

let adminSupabase = null;
if (env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) {
  adminSupabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

export { adminSupabase };