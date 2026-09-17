'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { findWinners, formatCompact, type LabSummary } from '@/lib/lab/stats';
import type { LabRange } from '@/lib/lab/types';
import { getLabStats } from '@/lib/lab/actions';
import { LabRankTables } from './LabRankTables';

interface Props {
  initial: LabSummary | null;
  locale: 'id' | 'en';
  refreshKey?: number;
}

const RANGES: { value: LabRange; key: 'rangeToday' | 'range7d' | 'range14d' | 'range30d' | 'rangeAll' }[] = [
  { value: 'today', key: 'rangeToday' },
  { value: '7d', key: 'range7d' },
  { value: '14d', key: 'range14d' },
  { value: '30d', key: 'range30d' },
  { value: 'all', key: 'rangeAll' }
];

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

function RangeTabs({
  range,
  pick,
  t
}: {
  range: LabRange;
  pick: (r: LabRange) => void;
  t: (key: 'rangeToday' | 'range7d' | 'range14d' | 'range30d' | 'rangeAll' | 'loading') => string;
}) {
  return (
    <div className="mt-2 flex flex-wrap gap-1.5" role="tablist" aria-label="range">
      {RANGES.map((r) => (
        <button
          key={r.value}
          type="button"
          role="tab"
          aria-selected={range === r.value}
          onClick={() => pick(r.value)}
          className={`rounded-full px-3 py-1 text-xs font-medium ${
            range === r.value ? 'bg-primary text-white' : 'border border-line text-ink-muted hover:text-primary'
          }`}
        >
          {t(r.key)}
        </button>
      ))}
    </div>
  );
}

export function LabStats({ initial, locale, refreshKey = 0 }: Props) {
  const t = useTranslations('lab.stats');
  const [summary, setSummary] = useState<LabSummary | null>(initial);
  const [range, setRange] = useState<LabRange>('30d');
  const [loading, setLoading] = useState(false);

  async function load(r: LabRange) {
    setLoading(true);
    try {
      setSummary(await getLabStats(r));
    } catch {
      // Ringkasan lama tetap tampil.
    } finally {
      setLoading(false);
    }
  }

  // Submit baru → refresh rentang aktif.
  useEffect(() => {
    if (refreshKey === 0) return;
    load(range);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  function pick(r: LabRange) {
    setRange(r);
    load(r);
  }

  if (!summary || summary.runs === 0) {
    return (
      <section aria-label={t('heading')} className="mt-10">
        <h2 className="text-lg font-semibold text-ink">{t('heading')}</h2>
        <RangeTabs range={range} pick={pick} t={t} />
        <p className="mt-2 text-sm text-ink-muted">{loading ? t('loading') : t('empty')}</p>
      </section>
    );
  }

  const maxTokens = Math.max(1, ...summary.byRun.map((c) => c.prompt + c.completion));
  const maxLatency = Math.max(1, ...summary.byRun.map((c) => c.latencyMs ?? 0));
  const maxTps = Math.max(0.01, ...summary.byRun.map((c) => c.tps ?? 0));
  const winners = findWinners(
    summary.byRun.map((c) => ({ id: c.runId, ok: c.ok, latencyMs: c.latencyMs, tps: c.tps, total: c.total }))
  );
  const hasWinners = winners.latency.length + winners.speed.length + winners.tokens.length > 0;

  return (
    <section aria-label={t('heading')} className="mt-10 space-y-3">
      <h2 className="text-lg font-semibold text-ink">{t('heading')}</h2>
      <RangeTabs range={range} pick={pick} t={t} />
      {loading ? <p className="text-xs text-ink-muted">{t('loading')}</p> : null}
      <LabRankTables providers={summary.ranks.providers} models={summary.ranks.models} locale={locale} />
      {hasWinners ? <p className="text-xs text-ink-muted">{t('legend')}</p> : null}

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
              const win = winners.tokens.includes(c.runId);
              return (
                <li key={i} className="text-[11px]">
                  <p className={`truncate ${win ? 'font-semibold text-emerald-600' : 'text-ink-muted'}`} title={c.label}>
                    {win ? '★ ' : ''}{c.label}{!c.ok ? ' · ERR' : ''}{c.fallback ? ' · fb' : ''}
                  </p>
                  <div
                    className={`mt-0.5 flex h-2.5 w-full overflow-hidden rounded-full bg-muted ${win ? '' : 'opacity-40'}`}
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
              <span className={`w-40 shrink-0 truncate ${winners.latency.includes(c.runId) ? 'font-semibold text-emerald-600' : 'text-ink-muted'}`} title={c.label}>
                {winners.latency.includes(c.runId) ? '★ ' : ''}{c.label}
              </span>
              <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted" role="img" aria-label={`${c.label}: ${c.latencyMs ?? 0}ms`}>
                <div className={`h-full rounded-full ${winners.latency.includes(c.runId) ? 'bg-emerald-500' : 'bg-sky-500 opacity-40'}`} style={{ width: `${(((c.latencyMs ?? 0) / maxLatency) * 100).toFixed(1)}%` }} />
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
              <span className={`w-40 shrink-0 truncate ${winners.speed.includes(c.runId) ? 'font-semibold text-emerald-600' : 'text-ink-muted'}`} title={c.label}>
                {winners.speed.includes(c.runId) ? '★ ' : ''}{c.label}
              </span>
              <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted" role="img" aria-label={`${c.label}: ${c.tps ?? 0} tok/s`}>
                <div className={`h-full rounded-full bg-emerald-500 ${winners.speed.includes(c.runId) ? '' : 'opacity-40'}`} style={{ width: `${(((c.tps ?? 0) / maxTps) * 100).toFixed(1)}%` }} />
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
