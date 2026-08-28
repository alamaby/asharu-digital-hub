import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { env } from '@/lib/env';

/** SSR client for the current user (respects RLS via anon key + cookies). */
export async function createSupabaseServer() {
  if (!env.hasSupabase) return null;
  const cookieStore = await cookies();
  return createServerClient(env.supabaseUrl!, env.supabaseAnonKey!, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(toSet) {
        try {
          for (const { name, value, options } of toSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // RSC cannot set cookies; the middleware refreshes the session.
        }
      }
    }
  });
}

/** Service-role client — bypasses RLS. Only call from trusted server contexts. */
export function createSupabaseService() {
  if (!env.supabaseServiceRoleKey) return null;
  return createClient(env.supabaseUrl!, env.supabaseServiceRoleKey!, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}
