'use client';

import { useFormStatus } from 'react-dom';

/** Notice inline untuk aksi admin (pengganti toast — repo tanpa lib toast). */
export interface ActionNotice {
  type: 'working' | 'success' | 'error';
  message: string;
  /** Detail teknis (collapsible), mis. pesan error server. */
  detail?: string;
}

function Spinner({ className = 'size-3' }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={`${className} animate-spin`} aria-hidden>
      <circle cx="10" cy="10" r="8" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M18 10a8 8 0 00-8-8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function ActionNoticeView({ notice }: { notice: ActionNotice | null }) {
  if (!notice) return null;
  if (notice.type === 'error') {
    return (
      <div role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-800">
        <p className="font-medium">{notice.message}</p>
        {notice.detail ? (
          <details className="mt-1">
            <summary className="cursor-pointer text-red-700">Detail teknis</summary>
            <p className="mt-1 break-words font-mono text-[11px]">{notice.detail}</p>
          </details>
        ) : null}
      </div>
    );
  }
  return (
    <p role="status" className="flex items-center gap-2 rounded-lg bg-background px-3 py-2 text-xs text-ink-muted">
      {notice.type === 'working' ? <Spinner /> : <span aria-hidden>✓</span>}
      <span>{notice.message}</span>
    </p>
  );
}

/** Tombol submit dengan status pending otomatis (wajib di dalam <form>). */
export function PendingButton({
  label,
  pendingLabel,
  className
}: {
  label: string;
  pendingLabel?: string;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className={
        className ??
        'rounded bg-primary px-2 py-1 text-xs text-white disabled:cursor-not-allowed disabled:opacity-60'
      }
    >
      <span className="inline-flex items-center gap-1.5">
        {pending ? <Spinner /> : null}
        {pending ? (pendingLabel ?? 'Menyimpan…') : label}
      </span>
    </button>
  );
}

/** Skeleton untuk section board saat streaming (Suspense fallback). */
export function BoardSkeleton({ lines = 4, label = 'Memuat data…' }: { lines?: number; label?: string }) {
  return (
    <div aria-busy="true" aria-live="polite" aria-label={label} className="space-y-2">
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="h-12 animate-pulse rounded-lg border border-line bg-background" />
      ))}
    </div>
  );
}
