'use client';

import Script from 'next/script';
import { useEffect, useState } from 'react';
import { CONSENT_CHANGE_EVENT, readConsent } from '@/lib/analytics/consent';

interface GoogleAnalyticsProps {
  measurementId: string;
}

/**
 * Consent-gated GA4 loader. Nothing is requested until consent is stored;
 * withdrawal sets the `ga-disable-*` flag so hits stop immediately.
 */
export function GoogleAnalytics({ measurementId }: GoogleAnalyticsProps) {
  const [granted, setGranted] = useState(false);

  useEffect(() => {
    const sync = () => {
      const allowed = readConsent(window.localStorage)?.analytics === true;
      setGranted(allowed);
      (window as unknown as Record<string, boolean | undefined>)[
        `ga-disable-${measurementId}`
      ] = !allowed;
    };
    sync();
    window.addEventListener('storage', sync);
    window.addEventListener(CONSENT_CHANGE_EVENT, sync);
    return () => {
      window.removeEventListener('storage', sync);
      window.removeEventListener(CONSENT_CHANGE_EVENT, sync);
    };
  }, [measurementId]);

  if (!granted) return null;

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${measurementId}`}
        strategy="afterInteractive"
      />
      <Script
        id="ga4-init"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{
          __html: `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}window.gtag=gtag;gtag('js',new Date());gtag('config','${measurementId}');`
        }}
      />
    </>
  );
}
