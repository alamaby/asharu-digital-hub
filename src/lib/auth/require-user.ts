import { createSupabaseServer } from '@/lib/supabase/server';

/**
 * Login-only guard untuk Studio. Berbeda dari `isAdmin()`: user biasa yang
 * login via magic link boleh masuk; anon ditolak.
 * Melempar Error('Login diperlukan…') agar server action menampilkan notice
 * yang jelas di UI (ditangkap dan dirender sebagai `role="status"`).
 */
export async function requireUser(): Promise<{ id: string; email: string | null }> {
  const supabase = await createSupabaseServer();
  if (!supabase) throw new Error('Login diperlukan — Supabase belum dikonfigurasi.');
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Login diperlukan — masuk dulu via /masuk untuk memakai Studio.');
  return { id: user.id, email: user.email ?? null };
}
