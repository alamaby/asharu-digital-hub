import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Satu-satunya tempat kredensial service-role dibaca.
 *
 * Dua kontrak eksplisit supaya pemanggil memilih dengan sadar:
 * - `getServiceClient()`   → throw bila kredensial belum diisi (jalur server
 *   task/cron yang memang tidak boleh jalan tanpa DB).
 * - `tryServiceClient()`   → null bila belum diisi (jalur page/route yang masih
 *   boleh render dengan fitur nonaktif, mis. `createSupabaseService()`).
 */
export function tryServiceClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

export function getServiceClient(): SupabaseClient {
  const client = tryServiceClient();
  if (!client) throw new Error('Supabase service credentials missing (set SUPABASE_SECRET_KEY)');
  return client;
}
