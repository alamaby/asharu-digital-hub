'use client';

import { useTranslations } from 'next-intl';
import { formatCompact, type RankEntry } from '@/lib/lab/stats';

interface Props {
  providers: RankEntry[];
  models: RankEntry[];
  locale: 'id' | 'en';
}

function fmtMs(v: number | null): string {
  if (v === null) return '-';
  return v >= 1000 ? `${(v / 1000).toFixed(1)}s` : `${Math.round(v)}ms`;
}

function RankTable({ title, entries, locale }: { title: string; entries: RankEntry[]; locale: 'id' | 'en' }) {
  const t = useTranslations('lab.stats');
  if (entries.length === 0) return null;
  return (
    <div className="min-w-0 flex-1">
      <p className="text-xs font-semibold text-ink">{title}</p>
      <div className="mt-2 overflow-x-auto rounded-lg border border-line">
        <table className="w-full text-left text-xs">
          <thead className="bg-muted text-ink-muted">
            <tr>
              <th scope="col" className="px-2 py-1.5">#</th>
              <th scope="col" className="px-2 py-1.5">{t('rankName')}</th>
              <th scope="col" className="px-2 py-1.5 text-right">{t('rankRuns')}</th>
              <th scope="col" className="px-2 py-1.5 text-right">{t('rankSuccess')}</th>
              <th scope="col" className="px-2 py-1.5 text-right">{t('rankLatency')}</th>
              <th scope="col" className="px-2 py-1.5 text-right">{t('rankSpeed')}</th>
              <th scope="col" className="px-2 py-1.5 text-right">{t('rankTokens')}</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e, i) => (
              <tr
                key={e.key}
                className={`border-t border-line ${i === 0 ? 'bg-emerald-500/10 font-semibold' : ''}`}
              >
                <td className="px-2 py-1.5">{i === 0 ? '★ 1' : i + 1}</td>
                <td className="max-w-40 truncate px-2 py-1.5" title={e.label}>{e.label}</td>
                <td className="px-2 py-1.5 text-right font-mono">{e.runs}</td>
                <td className="px-2 py-1.5 text-right font-mono">{e.successPct}%</td>
                <td className="px-2 py-1.5 text-right font-mono">{fmtMs(e.avgLatencyMs)}</td>
                <td className="px-2 py-1.5 text-right font-mono">
                  {e.avgTps === null ? t('unknown') : e.avgTps}
                </td>
                <td className="px-2 py-1.5 text-right font-mono">{formatCompact(e.totalTokens, locale)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function LabRankTables({ providers, models, locale }: Props) {
  const t = useTranslations('lab.stats');
  if (providers.length === 0 && models.length === 0) return null;
  return (
    <div className="rounded-xl border border-line bg-surface p-3">
      <div className="grid gap-4 lg:grid-cols-2">
        <RankTable title={t('rankProviders')} entries={providers} locale={locale} />
        <RankTable title={t('rankModels')} entries={models} locale={locale} />
      </div>
    </div>
  );
}
