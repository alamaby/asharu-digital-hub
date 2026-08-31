import { timingSafeEqual } from 'node:crypto';
import { env } from '@/lib/env';

export interface CronAuthOptions {
  /** Override the parsed CRON_SECRET (for tests). */
  secret?: string;
  /** Override the production check (for tests). */
  isProduction?: boolean;
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/**
 * Authorize processor calls (cron/manual) — Bearer-only.
 *
 * The spoofable `x-vercel-cron` header is deliberately NOT accepted: since the
 * cron moved to Supabase pg_cron, nothing legitimate sends it. In production a
 * missing CRON_SECRET fails closed (every call is denied) rather than opening
 * the endpoint; local dev without a secret stays usable.
 */
export function isCronAuthorized(request: Request, options: CronAuthOptions = {}): boolean {
  const secret = options.secret ?? env.cronSecret;
  if (secret) {
    const header = request.headers.get('authorization') ?? '';
    return safeEqual(header, `Bearer ${secret}`);
  }
  const isProduction = options.isProduction ?? process.env.NODE_ENV === 'production';
  return !isProduction;
}
