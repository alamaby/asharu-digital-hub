'use client';

import { Suspense, useEffect, useRef } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { trackPageView } from '@/lib/analytics/events';

function PageViewEffect() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const lastPathRef = useRef<string | null>(null);

  useEffect(() => {
    const search = searchParams.toString();
    const path = search ? `${pathname}?${search}` : pathname;
    if (lastPathRef.current === path) return;
    lastPathRef.current = path;
    trackPageView({
      page_location: `${window.location.origin}${path}`,
      page_title: document.title
    });
  }, [pathname, searchParams]);

  return null;
}

/**
 * Sends the standard GA4 page_view on every client-side navigation
 * (Next.js App Router does not emit these automatically). No-op without
 * consent/analytics. Path and title only — never query PII beyond the URL.
 */
export function PageViewTracker() {
  return (
    <Suspense fallback={null}>
      <PageViewEffect />
    </Suspense>
  );
}
