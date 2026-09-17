'use client';

import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { LabBatchWithRuns } from '@/lib/lab/types';
import { findWinners } from '@/lib/lab/stats';

interface Props {
  /** Batch terbaru hasil submit (null = belum ada). */
  result: LabBatchWithRuns | null;
}

function pretty(v: unknown): string {
  try {
    if (typeof v === 'string') {
      try {
        return JSON.stringify(JSON.parse(v), null, 2);
      } catch {
        return v;
      }
    }
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}

function fmtInt(v: number | null): string {
  return v === null || v === undefined ? '-' : v.toLocaleString();
}

function MetricBox({
  label,
  value,
  win,
  accent
}: {
  label: string;
  value: string;
  win?: string | null;
  accent?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border px-1 py-1.5 ${win ? 'border-emerald-500 ring-1 ring-emerald-500' : 'border-line'}`}
      title={win ?? undefined}
    >
      <dt className="text-[10px] uppercase tracking-wide text-ink-muted">{label}</dt>
      <dd className={`font-mono text-sm font-semibold ${accent && !win ? 'text-primary' : win ? 'text-emerald-600' : 'text-ink'}`}>
        {value}
      </dd>
      {win ? <p className="mt-0.5 text-[10px] font-medium text-emerald-600">★ {win}</p> : null}
    </div>
  );
}

export function LabCompareGrid({ result }: Props) {
  const t = useTranslations('lab.result');
  const tNotice = useTranslations('lab.notice');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  if (!result) return <p className="mt-6 text-sm text-ink-muted">{tNotice('empty')}</p>;

  const okCount = result.runs.filter((r) => !r.error).length;
  const errCount = result.runs.length - okCount;
  const winners = findWinners(
    result.runs.map((r) => ({
      id: r.id,
      ok: !r.error,
      latencyMs: r.latency_ms,
      tps: r.tokens_per_sec,
      total: r.total_tokens
    }))
  );
  const hasWinners = winners.latency.length + winners.speed.length + winners.tokens.length > 0;

  async function copy(runId: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopiedId(runId);
    setTimeout(() => setCopiedId((c) => (c === runId ? null : c)), 1500);
  }

  return (
    <section aria-label={t('heading')} className="mt-8">
      <h2 className="text-lg font-semibold text-ink">{t('heading')}</h2>
      <p role="status" className="mt-1 text-sm text-ink-muted">
        {tNotice('done', { ok: okCount, err: errCount })}
      </p>
      {hasWinners ? <p className="mt-1 text-xs text-ink-muted">{t('legend')}</p> : null}
      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {result.runs.map((r) => {
          const label = r.provider_slug && r.model_slug
            ? `${r.provider_slug} / ${r.model_slug.split('/').pop()}`
            : tNotice('empty');
          return (
            <article key={r.id} className="flex flex-col rounded-xl border border-line bg-surface p-4">
              <header className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-semibold text-ink" title={r.model_slug}>{label}</h3>
                {r.is_fallback ? (
                  <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
                    {t('fallbackBadge')}
                  </span>
                ) : null}
                {r.response_truncated ? (
                  <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-800">
                    {t('truncatedBadge')}
                  </span>
                ) : null}
              </header>

              <dl className="mt-3 grid grid-cols-3 gap-1.5 text-center">
                <MetricBox label={t('tokensIn')} value={fmtInt(r.prompt_tokens)} />
                <MetricBox label={t('tokensOut')} value={fmtInt(r.completion_tokens)} accent />
                <MetricBox
                  label={t('tokensTotal')}
                  value={fmtInt(r.total_tokens)}
                  win={winners.tokens.includes(r.id) ? t('bestTokens') : null}
                />
                <MetricBox
                  label={t('latency')}
                  value={r.latency_ms === null ? '-' : `${r.latency_ms}ms`}
                  win={winners.latency.includes(r.id) ? t('bestLatency') : null}
                />
                <MetricBox
                  label={t('speed')}
                  value={r.tokens_per_sec === null ? '-' : `${r.tokens_per_sec}`}
                  win={winners.speed.includes(r.id) ? t('bestSpeed') : null}
                />
                <MetricBox label="HTTP" value={r.http_status === null ? '-' : String(r.http_status)} />
              </dl>
              <p className="mt-1 text-[11px] text-ink-muted">{t('ttftPending')}</p>

              {r.error ? (
                <p role="alert" className="mt-3 text-xs text-red-600">
                  {t('errorTitle')}: {r.error.slice(0, 500)}
                </p>
              ) : (
                <>
                  <pre className="mt-3 max-h-72 flex-1 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-muted p-3 text-xs leading-relaxed text-ink">
                    {r.response_text ?? '—'}
                  </pre>
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      onClick={() => copy(r.id, r.response_text ?? '')}
                      className="inline-flex items-center gap-1 rounded-md border border-line px-2 py-1 text-xs text-ink-muted hover:text-primary"
                    >
                      {copiedId === r.id ? <Check className="size-3.5" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
                      {copiedId === r.id ? t('copied') : t('copy')}
                    </button>
                  </div>
                </>
              )}

              <details className="mt-2">
                <summary className="cursor-pointer text-xs text-primary">Request</summary>
                <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded bg-muted p-2 text-[11px]">
                  {pretty(r.request_messages ?? '—')}
                </pre>
              </details>
            </article>
          );
        })}
      </div>
    </section>
  );
}
