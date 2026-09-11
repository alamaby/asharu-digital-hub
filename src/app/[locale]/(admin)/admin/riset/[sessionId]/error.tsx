'use client';

import { useEffect } from 'react';
import { Link } from '@/i18n/navigation';

export default function SessionError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Session error boundary:', error);
  }, [error]);
  return (
    <div className="mx-auto max-w-2xl px-4 py-16 text-center sm:px-6" role="alert">
      <h1 className="text-2xl font-semibold text-ink">Sesi riset gagal dimuat</h1>
      <p className="mt-3 text-base text-ink-muted">
        Coba lagi, atau kembali ke daftar riset.
      </p>
      {error.digest ? <p className="mt-2 text-xs text-ink-muted">digest: {error.digest}</p> : null}
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <button type="button" onClick={reset} className="btn-primary px-4 py-2 text-sm">
          Coba lagi
        </button>
        <Link
          href={{ pathname: '/admin/riset' }}
          className="rounded-lg border border-line bg-surface px-4 py-2 text-sm font-medium text-ink hover:border-primary"
        >
          Kembali ke daftar riset
        </Link>
      </div>
    </div>
  );
}
