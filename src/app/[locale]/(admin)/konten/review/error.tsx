'use client';

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';

export default function KontenError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations('admin.error');
  useEffect(() => {
    console.error('Konten error boundary:', error);
  }, [error]);
  return (
    <div className="mx-auto max-w-2xl px-4 py-16 text-center sm:px-6" role="alert">
      <h1 className="text-2xl font-semibold text-ink">{t('title')}</h1>
      <p className="mt-3 text-base text-ink-muted">{t('body')}</p>
      {error.digest ? <p className="mt-2 text-xs text-ink-muted">digest: {error.digest}</p> : null}
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <button
          type="button"
          onClick={reset}
          className="btn-primary px-4 py-2 text-sm"
        >
          {t('retry')}
        </button>
        <Link
          href={{ pathname: '/admin' }}
          className="rounded-lg border border-line bg-surface px-4 py-2 text-sm font-medium text-ink hover:border-primary"
        >
          {t('backToDashboard')}
        </Link>
      </div>
    </div>
  );
}
