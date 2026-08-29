import { createClient } from '@supabase/supabase-js';

export function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase service credentials missing (set SUPABASE_SECRET_KEY)');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
