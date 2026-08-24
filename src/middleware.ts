import createMiddleware from 'next-intl/middleware';
import { routing } from '@/i18n/routing';

export default createMiddleware(routing);

export const config = {
  // Match all pathnames except:
  // - `/api`, `/_next`, `/_vercel` internals
  // - any path containing a dot (static files: sitemap.xml, robots.txt,
  //   icons, images, generated metadata routes)
  matcher: '/((?!api|_next|_vercel|.*\\..*).*)'
};
