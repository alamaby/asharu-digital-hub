'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  CONSENT_CHANGE_EVENT,
  CONSENT_OPEN_EVENT,
  readConsent,
  writeConsent
} from '@/lib/analytics/consent';

/**
 * Non-blocking bottom banner. Shown until a decision exists; reopenable via
 * the footer "Analytics preferences" button (CONSENT_OPEN_EVENT).
 */
export function ConsentBanner() {
  const t = useTranslations('consent');
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(readConsent(window.localStorage) === null);
    const reopen = () => setVisible(true);
    window.addEventListener(CONSENT_OPEN_EVENT, reopen);
    return () => window.removeEventListener(CONSENT_OPEN_EVENT, reopen);
  }, []);

  function decide(analytics: boolean) {
    writeConsent(window.localStorage, analytics);
    window.dispatchEvent(new Event(CONSENT_CHANGE_EVENT));
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div
      role="region"
      aria-labelledby="consent-title"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-line bg-surface shadow-card"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="mx-auto flex max-w-6xl flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:px-6">
        <div className="max-w-2xl">
          <h2 id="consent-title" className="text-sm font-semibold text-ink">
            {t('title')}
          </h2>
          <p className="mt-1 text-sm text-ink-muted">{t('description')}</p>
        </div>
        <div className="flex shrink-0 gap-2">
          <button type="button" onClick={() => decide(true)} className="btn-primary">
            {t('accept')}
          </button>
          <button type="button" onClick={() => decide(false)} className="btn-secondary">
            {t('decline')}
          </button>
        </div>
      </div>
    </div>
  );
}
