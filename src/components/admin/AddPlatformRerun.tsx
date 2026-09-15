'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { addPlatformsAndRerun } from '@/lib/content/actions';

interface Props {
  sessionId: string;
  platforms: { slug: string; display_name: string }[];
}

export function AddPlatformRerun({ sessionId, platforms }: Props) {
  const t = useTranslations('admin.research');
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [, startTransition] = useTransition();

  if (platforms.length === 0) return null;

  function toggle(slug: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  }

  async function onAdd() {
    if (selected.size === 0) return;
    setBusy(true);
    setError(null);
    const result = await addPlatformsAndRerun(sessionId, Array.from(selected));
    setBusy(false);
    if (!result.success) {
      setError(result.error ?? t('addPlatformError'));
      return;
    }
    setSelected(new Set());
    setOpen(false);
    setDone(true);
    startTransition(() => router.refresh());
  }

  return (
    <div className="mt-3 rounded-xl border border-line bg-surface p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-ink">{t('addPlatformHeading')}</p>
          <p className="mt-0.5 text-xs text-ink-muted">{t('addPlatformHint')}</p>
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          disabled={busy}
          className="rounded-lg border border-line bg-background px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:border-primary disabled:opacity-60"
        >
          {open ? t('addPlatformClose') : t('addPlatformOpen')}
        </button>
      </div>

      {open ? (
        <div className="mt-3 space-y-3">
          <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
            {platforms.map((p) => (
              <label
                key={p.slug}
                className="flex cursor-pointer items-center gap-2 rounded-lg border border-line bg-background px-3 py-2 text-sm text-ink has-checked:border-primary"
              >
                <input
                  type="checkbox"
                  checked={selected.has(p.slug)}
                  disabled={busy}
                  onChange={() => toggle(p.slug)}
                  className="size-4 rounded border-line accent-[var(--color-primary)] disabled:opacity-50"
                />
                {p.display_name}
              </label>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onAdd}
              disabled={selected.size === 0 || busy}
              aria-busy={busy}
              className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/10 px-4 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? (
                <svg viewBox="0 0 20 20" fill="none" className="size-4 animate-spin" aria-hidden>
                  <circle cx="10" cy="10" r="8" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
                  <path d="M18 10a8 8 0 00-8-8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                </svg>
              ) : null}
              {busy ? t('addPlatformWorking') : t('addPlatformAction')}
            </button>
            <span className="text-xs text-ink-muted">
              {selected.size > 0 ? t('addPlatformSelected', { count: selected.size }) : t('addPlatformPickHint')}
            </span>
          </div>
          {error ? (
            <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-800">
              {error}
            </p>
          ) : null}
        </div>
      ) : null}

      {done && !open ? (
        <p role="status" aria-live="polite" className="mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
          {t('addPlatformSuccess')}
        </p>
      ) : null}
    </div>
  );
}
