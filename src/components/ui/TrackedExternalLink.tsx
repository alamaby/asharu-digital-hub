'use client';

import type { ReactNode } from 'react';
import { trackEvent, type AnalyticsEventName, type AnalyticsEventParams } from '@/lib/analytics/events';
import { ExternalLink } from './ExternalLink';

interface TrackedExternalLinkProps {
  href: string;
  event: AnalyticsEventName;
  params?: AnalyticsEventParams;
  className?: string;
  /** Extra rel tokens (e.g. `sponsored nofollow` for affiliate links). */
  rel?: string;
  'aria-label'?: string;
  children: ReactNode;
}

/** ExternalLink that fires a typed GA4 event on click (no-op without consent). */
export function TrackedExternalLink({
  href,
  event,
  params,
  rel,
  children,
  ...rest
}: TrackedExternalLinkProps) {
  return (
    <ExternalLink
      href={href}
      rel={rel}
      onClick={() => {
        trackEvent(event, params);
      }}
      {...rest}
    >
      {children}
    </ExternalLink>
  );
}
