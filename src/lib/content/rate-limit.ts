import { createClient } from '@supabase/supabase-js';

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase service credentials missing');
  return createClient(url, key, { auth: { persistSession: false } });
}

/**
 * Simple DB-backed rate limit: 5 per IP per hour per scope.
 * Returns true if allowed, false if exceeded.
 */
export async function checkRateLimit(ip: string, scope = 'content_request', limit = 5): Promise<{ allowed: boolean; count: number }> {
  const supabase = getServiceClient();
  const windowStart = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  const { data } = await supabase
    .from('rate_limits')
    .select('count, window_start')
    .eq('ip', ip)
    .eq('scope', scope)
    .maybeSingle();

  const current = data as { count: number; window_start: string } | null;
  if (!current) return { allowed: true, count: 0 };
  // If window expired, allow
  if (new Date(current.window_start).toISOString() < windowStart) return { allowed: true, count: 0 };
  return { allowed: current.count < limit, count: current.count };
}

export async function incrementRateLimit(ip: string, scope = 'content_request'): Promise<void> {
  const supabase = getServiceClient();
  const { data } = await supabase
    .from('rate_limits')
    .select('count, window_start')
    .eq('ip', ip)
    .eq('scope', scope)
    .maybeSingle();

  const now = new Date().toISOString();
  const current = data as { count: number; window_start: string } | null;

  if (!current) {
    await supabase.from('rate_limits').insert({ ip, scope, count: 1, window_start: now });
    return;
  }

  const windowStart = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  if (new Date(current.window_start).toISOString() < windowStart) {
    await supabase.from('rate_limits').update({ count: 1, window_start: now }).eq('ip', ip).eq('scope', scope);
  } else {
    await supabase.from('rate_limits').update({ count: current.count + 1 }).eq('ip', ip).eq('scope', scope);
  }
}

export function getClientIp(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]!.trim();
  const realIp = headers.get('x-real-ip');
  if (realIp) return realIp.trim();
  return 'unknown';
}
