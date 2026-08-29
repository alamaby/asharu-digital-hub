import { NextResponse, type NextRequest } from 'next/server';
import createMiddleware from 'next-intl/middleware';
import { createServerClient } from '@supabase/ssr';
import { routing } from '@/i18n/routing';

const intlMiddleware = createMiddleware(routing);

export default async function middleware(request: NextRequest) {
  const intlResponse = intlMiddleware(request);

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  let supabaseResponse = intlResponse;
  let user: import('@supabase/supabase-js').User | null = null;

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
    const { data } = await supabase.auth.getUser();
    user = data.user;
    supabaseResponse = response;
  }

  // Guard /konten/review — only admin; anon or non-admin → /masuk
  const pathname = request.nextUrl.pathname;
  const isReview = /^\/(id|en)\/konten\/review(\/|$)/.test(pathname);
  if (isReview) {
    if (!supabaseUrl || !supabaseKey) {
      // Supabase not configured — treat as not authenticated
      const locale = pathname.startsWith('/en/') ? 'en' : 'id';
      return NextResponse.redirect(new URL(`/${locale}/masuk`, request.url));
    }
    if (!user) {
      const locale = pathname.startsWith('/en/') ? 'en' : 'id';
      return NextResponse.redirect(new URL(`/${locale}/masuk`, request.url));
    }
    const email = (user.email ?? '').toLowerCase();
    const isAdmin =
      email === 'alam.aby.b@gmail.com' || email === 'alamaby@gmail.com';
    if (!isAdmin) {
      const locale = pathname.startsWith('/en/') ? 'en' : 'id';
      return NextResponse.redirect(new URL(`/${locale}/masuk`, request.url));
    }
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
