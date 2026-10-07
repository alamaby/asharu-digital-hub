import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { safeInternalPath } from '@/lib/utils/safe-url';

const DEFAULT_NEXT = '/id/konten/review';

/**
 * Tukar `code` (PKCE/OAuth) menjadi sesi lalu redirect.
 *
 * Guard: kredensial route ini adalah parameter `code` sekali-pakai yang
 * divalidasi Supabase — belum ada sesi untuk dicek di sini (route inilah yang
 * membuatnya). Karena itu `next` WAJIB dibatasi ke origin sendiri; tanpa itu
 * endpoint ini jadi open redirect untuk phishing.
 */
function resolveSameOrigin(nextPath: string, requestUrl: URL): URL {
  const target = new URL(nextPath, requestUrl);
  if (target.origin !== requestUrl.origin) return new URL(DEFAULT_NEXT, requestUrl);
  return target;
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const next = safeInternalPath(url.searchParams.get('next'), DEFAULT_NEXT);

  if (!code) {
    return NextResponse.redirect(new URL('/id/masuk', request.url));
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.redirect(new URL('/id/masuk', request.url));
  }

  const response = NextResponse.redirect(resolveSameOrigin(next, url));
  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      }
    }
  });

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(new URL('/id/masuk?error=exchange_failed', request.url));
  }

  return response;
}
