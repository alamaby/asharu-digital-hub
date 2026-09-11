import type { ReactNode } from 'react';
import { env } from '@/lib/env';
import { JsonLd } from '@/components/ui/JsonLd';
import { organizationSchema, websiteSchema } from '@/lib/seo/jsonld';
import { SkipLink } from '@/components/layout/SkipLink';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { ConsentBanner } from '@/components/analytics/ConsentBanner';
import { GoogleAnalytics } from '@/components/analytics/GoogleAnalytics';
import { PageViewTracker } from '@/components/analytics/PageViewTracker';

/** Chrome publik: header, footer, consent/analytics, JSON-LD SEO. */
export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <SkipLink />
      <Header />
      <main id="main-content" tabIndex={-1} className="flex-1 focus:outline-none">
        {children}
      </main>
      <Footer showAnalyticsPrefs={Boolean(env.gaMeasurementId)} />
      <ConsentBanner enabled={Boolean(env.gaMeasurementId)} />
      {env.gaMeasurementId ? (
        <>
          <GoogleAnalytics measurementId={env.gaMeasurementId} />
          <PageViewTracker />
        </>
      ) : null}
      <JsonLd data={websiteSchema()} />
      <JsonLd data={organizationSchema()} />
    </>
  );
}
