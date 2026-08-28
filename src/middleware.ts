import { NextResponse, type NextRequest } from 'next/server';
import createMiddleware from 'next-intl/middleware';
import { createServerClient } from '@supabase/ssr';
import { routing } from '@/i18n/routing';

const intlMiddleware = createMiddleware(routing);

export default async function middleware(request: NextRequest) {
  const intlResponse = intlMiddleware(request);

  // Refresh Supabase session on every matched request so cookies stay in sync.
  // When env is not yet provisioned, skip silently — the static pages still build.
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  let supabaseResponse = intlResponse;
  if (supabaseUrl && supabaseKey) {
    const response = intlResponse ?? NextResponse.next({ request });
    const supabase = createServerClient(supabaseUrl, supabaseKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value, options } of cookiesToSet) {
            request.cookies.set(name, value);
            response.cookies.set(name, value, options);
          }
        }
      }
    });
    await supabase.auth.getUser();
    supabaseResponse = response;
  }

  return supabaseResponse ?? intlResponse;
}

export const config = {
  // Match all pathnames except:
  // - `/api`, `/_next`, `/_vercel` internals
  // - any path containing a dot (static files: sitemap.xml, robots.txt,
  //   icons, images, generated metadata routes)
  matcher: '/((?!api|_next|_vercel|.*\\..*).*)'
};
