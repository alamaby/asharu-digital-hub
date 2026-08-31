import { createSupabaseServer } from '@/lib/supabase/server';

/**
 * Server-side admin check. `profiles.is_admin` is the single source of
 * truth (see migration 20260901000001_consolidate_admin_auth.sql). The
 * profiles RLS policy (`id = auth.uid() OR is_admin()`) lets a caller read
 * their own row, so this is safe to call from any server context.
 *
 * Returns:
 *   - `true`  if the current user is signed in AND has is_admin = true.
 *   - `false` if unauthenticated, Supabase is not configured, the profile
 *            row is missing, or is_admin is false.
 */
export async function isAdmin(): Promise<boolean> {
  const supabase = await createSupabaseServer();
  if (!supabase) return false;
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return false;
  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .maybeSingle();
  return Boolean((profile as { is_admin?: boolean } | null)?.is_admin);
}
