import { cache } from 'react';
import { cookies } from 'next/headers';
import { createSupabaseServer } from '@/lib/supabase/server';
import { resolveTimezone } from '@/lib/utils/format';

/**
 * Resolve the display timezone for the current request (RSC).
 * Order: profiles.timezone (user pref) -> USER_TZ cookie (device) -> Asia/Jakarta.
 * Cached per-request via React `cache()` so multiple RSC calls share one lookup.
 */
export const getDisplayTimezone = cache(async (): Promise<string> => {
  let userTimezone: string | null = null;
  const supabase = await createSupabaseServer();
  if (supabase) {
    try {
      const {
        data: { user }
      } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('timezone')
          .eq('id', user.id)
          .maybeSingle();
        userTimezone = (profile as { timezone?: string | null } | null)?.timezone ?? null;
      }
    } catch {
      // ignore
    }
  }
  const cookieStore = await cookies();
  const deviceTz = cookieStore.get('USER_TZ')?.value ?? null;
  return resolveTimezone(userTimezone, deviceTz);
});
