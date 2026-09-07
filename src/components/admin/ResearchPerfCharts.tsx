import { formatCompact, type LlmSummary, type SearchSummary } from '@/lib/research/perf-summary';

interface Labels {
  llmHeading: string;
  searchHeading: string;
  calls: string;
  tokensIn: string;
  tokensOut: string;
  tokensTotal: string;
  avgLatency: string;
  errors: string;
  fallbacks: string;
  queries: string;
  results: string;
  tokenPerCall: string;
  statusTitle: string;
  latencyPerCall: string;
  resultsPerQuery: string;
  empty: string;
  ms: string;
}

interface Props {
  llm: LlmSummary;
  search: SearchSummary;
  locale: 'id' | 'en';
  labels: Labels;
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-lg border border-line bg-background px-2.5 py-1.5">
      <p className="text-[10px] uppercase tracking-wide text-ink-muted">{label}</p>
      <p className={`font-mono text-sm font-semibold ${accent ? 'text-primary' : 'text-ink'}`}>{value}</p>
    </div>
  );
}

function Donut({ ok, err, fb, label }: { ok: number; err: number; fb: number; label: string }) {
  const total = Math.max(1, ok + err + fb);
  const R = 26;
  const C = 2 * Math.PI * R;
  const segs = [
    { v: ok, cls: 'stroke-emerald-500' },
    { v: err, cls: 'stroke-red-500' },
    { v: fb, cls: 'stroke-amber-500' }
  ];
  let offset = 0;
  return (
    <svg viewBox="0 0 64 64" className="size-20 shrink-0" role="img" aria-label={label}>
      <circle cx="32" cy="32" r={R} fill="none" className="stroke-line" strokeWidth="9" />
      {segs.map((s, i) => {
        const len = (s.v / total) * C;
        const el = (
          <circle
            key={i}
            cx="32"
            cy="32"
            r={R}
            fill="none"
            className={s.cls}
            strokeWidth="9"
            strokeDasharray={`${len} ${C - len}`}
            strokeDashoffset={-offset}
            transform="rotate(-90 32 32)"
          />
        );
        offset += len;
        return el;
      })}
      <text x="32" y="36" textAnchor="middle" className="fill-ink text-sm font-bold">
        {ok + err + fb}
      </text>
    </svg>
  );
}

export function ResearchPerfCharts({ llm, search, locale, labels }: Props) {
  const maxTokens = Math.max(1, ...llm.byCall.map((c) => c.prompt + c.completion));
  const maxLatency = Math.max(1, ...llm.byCall.map((c) => c.latencyMs ?? 0), ...search.byCall.map((c) => c.latencyMs ?? 0));
  const maxYield = Math.max(1, ...search.byCall.map((c) => (c.queries > 0 ? c.results / c.queries : 0)));

  return (
    <div className="space-y-3">
      {/* KPI cards */}
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="rounded-xl border border-line bg-surface p-3">
          <p className="text-xs font-semibold text-ink">
            {labels.llmHeading} · {llm.calls} {labels.calls}
          </p>
          {llm.calls === 0 ? (
            <p className="mt-1 text-xs text-ink-muted">{labels.empty}</p>
          ) : (
            <div className="mt-2 grid grid-cols-3 gap-1.5">
              <Stat label={labels.tokensIn} value={formatCompact(llm.promptTotal, locale)} accent />
              <Stat label={labels.tokensOut} value={formatCompact(llm.completionTotal, locale)} accent />
              <Stat label={labels.tokensTotal} value={formatCompact(llm.tokenTotal, locale)} />
              <Stat label={labels.avgLatency} value={llm.avgLatencyMs === null ? '-' : `${(llm.avgLatencyMs / 1000).toFixed(1)}s`} />
              <Stat label={labels.errors} value={String(llm.errors)} />
              <Stat label={labels.fallbacks} value={String(llm.fallbacks)} />
            </div>
          )}
        </div>
        <div className="rounded-xl border border-line bg-surface p-3">
          <p className="text-xs font-semibold text-ink">
            {labels.searchHeading} · {search.calls} {labels.calls}
          </p>
          {search.calls === 0 ? (
            <p className="mt-1 text-xs text-ink-muted">{labels.empty}</p>
          ) : (
            <div className="mt-2 grid grid-cols-3 gap-1.5">
              <Stat label={labels.queries} value={formatCompact(search.queries, locale)} accent />
              <Stat label={labels.results} value={formatCompact(search.results, locale)} accent />
              <Stat label={labels.avgLatency} value={search.avgLatencyMs === null ? '-' : `${(search.avgLatencyMs / 1000).toFixed(1)}s`} />
            </div>
          )}
        </div>
      </div>

      {/* Token per LLM call (stacked bar) + status donut */}
      {llm.calls > 0 ? (
        <div className="grid gap-2 rounded-xl border border-line bg-surface p-3 sm:grid-cols-[1fr_auto]">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-ink">{labels.tokenPerCall}</p>
            <ul className="mt-2 space-y-1.5">
              {llm.byCall.map((c, i) => {
                const total = c.prompt + c.completion;
                const inPct = total > 0 ? (c.prompt / maxTokens) * 100 : 0;
                const outPct = total > 0 ? (c.completion / maxTokens) * 100 : 0;
                return (
                  <li key={i} className="text-[11px]">
                    <p className="truncate text-ink-muted" title={`${c.label} · ${c.stage}`}>
                      {c.label} · {c.stage}
                      {!c.ok ? ' · ERR' : ''}
                      {c.fallback ? ' · fb' : ''}
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
              <caption>{labels.tokenPerCall}</caption>
              <tbody>
                {llm.byCall.map((c, i) => (
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
            <p className="text-xs font-semibold text-ink">{labels.statusTitle}</p>
            <Donut ok={llm.okCount} err={llm.errors} fb={llm.fallbacks} label={`${labels.statusTitle}: ${llm.okCount} ok, ${llm.errors} err, ${llm.fallbacks} fb`} />
            <p className="text-[10px] text-ink-muted">
              <span className="text-emerald-600">● {llm.okCount}</span>{' '}
              <span className="text-red-600">● {llm.errors}</span>{' '}
              <span className="text-amber-600">● {llm.fallbacks}</span>
            </p>
          </div>
        </div>
      ) : null}

      {/* Latency per call */}
      {llm.calls + search.calls > 0 ? (
        <div className="rounded-xl border border-line bg-surface p-3">
          <p className="text-xs font-semibold text-ink">{labels.latencyPerCall} ({labels.ms})</p>
          <ul className="mt-2 space-y-1.5">
            {[...llm.byCall.map((c) => ({ label: c.label, ms: c.latencyMs })), ...search.byCall.map((c) => ({ label: c.label, ms: c.latencyMs }))].map((r, i) => (
              <li key={i} className="flex items-center gap-2 text-[11px]">
                <span className="w-40 shrink-0 truncate text-ink-muted" title={r.label}>
                  {r.label}
                </span>
                <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted" role="img" aria-label={`${r.label}: ${r.ms ?? 0}ms`}>
                  <div className="h-full rounded-full bg-sky-500" style={{ width: `${((r.ms ?? 0) / maxLatency) * 100}%` }} />
                </div>
                <span className="w-14 shrink-0 text-right font-mono text-[10px] text-ink-muted">
                  {r.ms === null ? '-' : `${(r.ms / 1000).toFixed(1)}s`}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* Search yield: results per query */}
      {search.calls > 0 ? (
        <div className="rounded-xl border border-line bg-surface p-3">
          <p className="text-xs font-semibold text-ink">{labels.resultsPerQuery}</p>
          <ul className="mt-2 space-y-1.5">
            {search.byCall.map((c, i) => {
              const ratio = c.queries > 0 ? c.results / c.queries : 0;
              return (
                <li key={i} className="flex items-center gap-2 text-[11px]">
                  <span className="w-40 shrink-0 truncate text-ink-muted" title={c.label}>
                    {c.label}
                  </span>
                  <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted" role="img" aria-label={`${c.label}: ${c.results}/${c.queries}`}>
                    <div className="h-full rounded-full bg-emerald-500" style={{ width: `${(ratio / maxYield) * 100}%` }} />
                  </div>
                  <span className="w-14 shrink-0 text-right font-mono text-[10px] text-ink-muted">
                    {c.results}/{c.queries}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
