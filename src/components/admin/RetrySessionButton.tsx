'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { retrySession } from '@/lib/content/actions';

export function RetrySessionButton({ sessionId }: { sessionId: string }) {
  const t = useTranslations('admin.research');
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onRetry() {
    setBusy(true);
    setError(null);
    const result = await retrySession(sessionId);
    setBusy(false);
    if (!result.success) {
      setError(result.error ?? 'failed');
      return;
    }
    startTransition(() => router.refresh());
  }

  return (
    <div className="mt-3 flex items-center gap-2">
      <button
        type="button"
        onClick={onRetry}
        disabled={busy || isPending}
        aria-busy={busy}
        className="flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-900 transition-colors hover:border-amber-500 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busy ? (
          <svg viewBox="0 0 20 20" fill="none" className="size-4 animate-spin" aria-hidden>
            <circle cx="10" cy="10" r="8" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
            <path d="M18 10a8 8 0 00-8-8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
          </svg>
        ) : null}
        {t('retryAction')}
      </button>
      {error ? (
        <p role="alert" className="text-xs text-red-700">{error}</p>
      ) : null}
    </div>
  );
}
