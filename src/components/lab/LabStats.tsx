'use client';

import { useTranslations } from 'next-intl';
import { formatCompact, type LabSummary } from '@/lib/lab/stats';

interface Props {
  summary: LabSummary | null;
  locale: 'id' | 'en';
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-lg border border-line bg-background px-2.5 py-1.5">
      <p className="text-[10px] uppercase tracking-wide text-ink-muted">{label}</p>
      <p className={`font-mono text-sm font-semibold ${accent ? 'text-primary' : 'text-ink'}`}>{value}</p>
    </div>
  );
}

function Donut({ ok, err, label }: { ok: number; err: number; label: string }) {
  const total = Math.max(1, ok + err);
  const R = 26;
  const C = 2 * Math.PI * R;
  const okLen = (ok / total) * C;
  return (
    <svg viewBox="0 0 64 64" className="size-20 shrink-0" role="img" aria-label={label}>
      <circle cx="32" cy="32" r={R} fill="none" className="stroke-line" strokeWidth="9" />
      <circle
        cx="32"
        cy="32"
        r={R}
        fill="none"
        className="stroke-emerald-500"
        strokeWidth="9"
        strokeDasharray={`${okLen} ${C - okLen}`}
        transform="rotate(-90 32 32)"
      />
      <text x="32" y="36" textAnchor="middle" className="fill-ink text-sm font-bold">
        {ok + err}
      </text>
    </svg>
  );
}

function fmtMs(v: number | null): string {
  if (v === null) return '-';
  return v >= 1000 ? `${(v / 1000).toFixed(1)}s` : `${Math.round(v)}ms`;
}

export function LabStats({ summary, locale }: Props) {
  const t = useTranslations('lab.stats');

  if (!summary || summary.runs === 0) {
    return (
      <section aria-label={t('heading')} className="mt-10">
        <h2 className="text-lg font-semibold text-ink">{t('heading')}</h2>
        <p className="mt-2 text-sm text-ink-muted">{t('empty')}</p>
      </section>
    );
  }

  const maxTokens = Math.max(1, ...summary.byRun.map((c) => c.prompt + c.completion));
  const maxLatency = Math.max(1, ...summary.byRun.map((c) => c.latencyMs ?? 0));
  const maxTps = Math.max(0.01, ...summary.byRun.map((c) => c.tps ?? 0));

  return (
    <section aria-label={t('heading')} className="mt-10 space-y-3">
      <h2 className="text-lg font-semibold text-ink">{t('heading')}</h2>

      <div className="rounded-xl border border-line bg-surface p-3">
        <div className="grid grid-cols-3 gap-1.5">
          <Stat label={t('batches')} value={String(summary.batches)} />
          <Stat label={t('runs')} value={String(summary.runs)} accent />
          <Stat label={t('successRate')} value={summary.successPct === null ? '-' : `${summary.successPct}%`} accent />
          <Stat label={t('avgLatency')} value={fmtMs(summary.avgLatencyMs)} />
          <Stat label={t('avgSpeed')} value={summary.avgTokensPerSec === null ? '-' : `${summary.avgTokensPerSec} ${t('tps')}`} />
          <Stat label={t('tokensTotal')} value={formatCompact(summary.tokenTotal, locale)} />
          <Stat label={t('tokensIn')} value={formatCompact(summary.promptTotal, locale)} />
          <Stat label={t('tokensOut')} value={formatCompact(summary.completionTotal, locale)} accent />
          <Stat label={t('errors')} value={String(summary.errors)} />
        </div>
      </div>

      <div className="grid gap-3 rounded-xl border border-line bg-surface p-3 sm:grid-cols-[1fr_auto]">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-ink">{t('tokensPerRun')}</p>
          <ul className="mt-2 space-y-1.5">
            {summary.byRun.map((c, i) => {
              const inPct = ((c.prompt / maxTokens) * 100).toFixed(1);
              const outPct = ((c.completion / maxTokens) * 100).toFixed(1);
              return (
                <li key={i} className="text-[11px]">
                  <p className="truncate text-ink-muted" title={c.label}>
                    {c.label}{!c.ok ? ' · ERR' : ''}{c.fallback ? ' · fb' : ''}
                  </p>
                  <div
                    className="mt-0.5 flex h-2.5 w-full overflow-hidden rounded-full bg-muted"
                    role="img"
                    aria-label={`${c.label}: in ${c.prompt}, out ${c.completion}`}
                  >
                    <div className="h-full bg-primary" style={{ width: `${inPct}%` }} />
                    <div className="h-full bg-primary/40" style={{ width: `${outPct}%` }} />
                  </div>
                  <p className="mt-0.5 font-mono text-[10px] text-ink-muted">
                    {formatCompact(c.prompt, locale)} + {formatCompact(c.completion, locale)}
                  </p>
                </li>
              );
            })}
          </ul>
          <table className="sr-only">
            <caption>{t('tokensPerRun')}</caption>
            <tbody>
              {summary.byRun.map((c, i) => (
                <tr key={i}>
                  <td>{c.label}</td>
                  <td>{c.prompt}</td>
                  <td>{c.completion}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex flex-col items-center justify-start gap-1">
          <p className="text-xs font-semibold text-ink">{t('statusTitle')}</p>
          <Donut ok={summary.ok} err={summary.errors} label={`${t('statusTitle')}: ${summary.ok} ok, ${summary.errors} err`} />
          <p className="text-[10px] text-ink-muted">
            <span className="text-emerald-600">● {summary.ok}</span>{' '}
            <span className="text-red-600">● {summary.errors}</span>
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-line bg-surface p-3">
        <p className="text-xs font-semibold text-ink">{t('latencyPerRun')}</p>
        <ul className="mt-2 space-y-1.5">
          {summary.byRun.map((c, i) => (
            <li key={i} className="flex items-center gap-2 text-[11px]">
              <span className="w-40 shrink-0 truncate text-ink-muted" title={c.label}>{c.label}</span>
              <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted" role="img" aria-label={`${c.label}: ${c.latencyMs ?? 0}ms`}>
                <div className="h-full rounded-full bg-sky-500" style={{ width: `${(((c.latencyMs ?? 0) / maxLatency) * 100).toFixed(1)}%` }} />
              </div>
              <span className="w-14 shrink-0 text-right font-mono text-[10px] text-ink-muted">
                {c.latencyMs === null ? '-' : fmtMs(c.latencyMs)}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div className="rounded-xl border border-line bg-surface p-3">
        <p className="text-xs font-semibold text-ink">{t('speedPerRun')}</p>
        <ul className="mt-2 space-y-1.5">
          {summary.byRun.map((c, i) => (
            <li key={i} className="flex items-center gap-2 text-[11px]">
              <span className="w-40 shrink-0 truncate text-ink-muted" title={c.label}>{c.label}</span>
              <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted" role="img" aria-label={`${c.label}: ${c.tps ?? 0} tok/s`}>
                <div className="h-full rounded-full bg-emerald-500" style={{ width: `${(((c.tps ?? 0) / maxTps) * 100).toFixed(1)}%` }} />
              </div>
              <span className="w-14 shrink-0 text-right font-mono text-[10px] text-ink-muted">
                {c.tps === null ? t('unknown') : c.tps}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
