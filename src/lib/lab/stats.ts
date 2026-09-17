import type { LabRange, LabRunRow } from './types';

/**
 * Awal rentang statistik (ISO) relatif ke `now`; null = semua waktu.
 * `today` = sejak 00:00 UTC, sama definisi kuota harian. Murni, unit-testable.
 */
export function rangeStart(range: LabRange, now: Date = new Date()): string | null {
  if (range === 'all') return null;
  if (range === 'today') {
    const d = new Date(now);
    d.setUTCHours(0, 0, 0, 0);
    return d.toISOString();
  }
  const days = range === '7d' ? 7 : range === '14d' ? 14 : 30;
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
}

/**
 * Agregasi murni statistik Chat Lab (unit-testable, tanpa I/O).
 * Fase 1 non-streaming: speed = completion_tokens / latency_s.
 * Nilai NULL (mis. Cloudflare tanpa usage) diabaikan di rata-rata.
 */

/** Token output per detik; NULL bila completion/latency tak diketahui. */
export function tokensPerSec(completionTokens: number | null, latencyMs: number | null): number | null {
  if (completionTokens === null || latencyMs === null) return null;
  if (!Number.isFinite(completionTokens) || !Number.isFinite(latencyMs)) return null;
  if (completionTokens < 0 || latencyMs <= 0) return null;
  return Math.round((completionTokens / (latencyMs / 1000)) * 100) / 100;
}

/** Throughput batch komparasi = Σ total_tokens / latency_terlama_s. */
export function batchThroughput(runs: Pick<LabRunRow, 'total_tokens' | 'latency_ms'>[]): number | null {
  const totals = runs.map((r) => r.total_tokens ?? 0).filter((v) => v > 0);
  const latencies = runs.map((r) => r.latency_ms ?? 0).filter((v) => v > 0);
  if (totals.length === 0 || latencies.length === 0) return null;
  const sum = totals.reduce((a, b) => a + b, 0);
  const maxLatency = Math.max(...latencies);
  if (maxLatency <= 0) return null;
  return Math.round((sum / (maxLatency / 1000)) * 100) / 100;
}

function avg(values: (number | null)[]): number | null {
  const known = values.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  if (known.length === 0) return null;
  return Math.round((known.reduce((a, b) => a + b, 0) / known.length) * 100) / 100;
}

export interface LabSummary {
  batches: number;
  runs: number;
  ok: number;
  errors: number;
  fallbacks: number;
  truncated: number;
  promptTotal: number;
  completionTotal: number;
  tokenTotal: number;
  avgLatencyMs: number | null;
  avgTokensPerSec: number | null;
  successPct: number | null;
  /** Papan peringkat best-first (sukses% → tok/s → runs). */
  ranks: { providers: RankEntry[]; models: RankEntry[] };
  /** Per-run untuk chart (diurutkan pemanggil). */
  byRun: {
    runId: string;
    label: string;
    provider: string;
    model: string;
    prompt: number;
    completion: number;
    /** Total token nullable — 0 berarti tak diketahui, bukan pemenang hemat. */
    total: number | null;
    latencyMs: number | null;
    tps: number | null;
    ok: boolean;
    fallback: boolean;
    createdAt: string;
  }[];
}

export function summarizeLabRuns(batches: number, runs: LabRunRow[]): LabSummary {
  const ok = runs.filter((r) => !r.error).length;
  const errors = runs.length - ok;
  const fallbacks = runs.filter((r) => r.is_fallback).length;
  const truncated = runs.filter((r) => r.response_truncated).length;
  const promptTotal = runs.reduce((a, r) => a + (r.prompt_tokens ?? 0), 0);
  const completionTotal = runs.reduce((a, r) => a + (r.completion_tokens ?? 0), 0);
  const tokenTotal = runs.reduce((a, r) => a + (r.total_tokens ?? r.prompt_tokens ?? 0) + (r.total_tokens ? 0 : (r.completion_tokens ?? 0)), 0);
  return {
    batches,
    runs: runs.length,
    ok,
    errors,
    fallbacks,
    truncated,
    promptTotal,
    completionTotal,
    tokenTotal,
    avgLatencyMs: avg(runs.map((r) => r.latency_ms)),
    avgTokensPerSec: avg(runs.map((r) => r.tokens_per_sec)),
    successPct: runs.length === 0 ? null : Math.round((ok / runs.length) * 1000) / 10,
    ranks: { providers: rankProviders(runs), models: rankModels(runs) },
    byRun: runs.map((r) => ({
      runId: r.id,
      label: `${r.provider_slug || '?'} / ${(r.model_slug || '').split('/').pop() || '?'}`,
      provider: r.provider_slug,
      model: r.model_slug,
      prompt: r.prompt_tokens ?? 0,
      completion: r.completion_tokens ?? 0,
      total: r.total_tokens,
      latencyMs: r.latency_ms,
      tps: r.tokens_per_sec,
      ok: !r.error,
      fallback: r.is_fallback,
      createdAt: r.created_at
    }))
  };
}

/**
 * Pemenang komparasi per metrik (murni, unit-testable).
 * Hanya run sukses yang ikut; nilai NULL didiskualifikasi; seri menang semua.
 * - latency: terendah menang · speed: tertinggi menang · tokens: tersedikit menang.
 */
export interface WinnerInput {
  id: string;
  ok: boolean;
  latencyMs: number | null;
  tps: number | null;
  total: number | null;
}

export interface LabWinners {
  latency: string[];
  speed: string[];
  tokens: string[];
}

function bestIds(
  items: WinnerInput[],
  pick: (r: WinnerInput) => number | null,
  mode: 'min' | 'max'
): string[] {
  const known = items.filter((r) => r.ok && pick(r) !== null);
  if (known.length === 0) return [];
  const values = known.map((r) => pick(r) as number);
  const best = mode === 'min' ? Math.min(...values) : Math.max(...values);
  return known.filter((r) => pick(r) === best).map((r) => r.id);
}

export function findWinners(runs: WinnerInput[]): LabWinners {
  return {
    latency: bestIds(runs, (r) => r.latencyMs, 'min'),
    speed: bestIds(runs, (r) => r.tps, 'max'),
    tokens: bestIds(runs, (r) => r.total, 'min')
  };
}

/**
 * Papan peringkat provider/model (murni, unit-testable).
 * Best = sukses% tertinggi, tie-break tok/s tertinggi (NULL diabaikan, bukan 0
 * — adil untuk provider tanpa data token seperti Cloudflare bila nihil).
 */
export interface RankEntry {
  key: string;
  label: string;
  runs: number;
  successPct: number;
  avgLatencyMs: number | null;
  avgTps: number | null;
  totalTokens: number;
}

interface RankInput {
  key: string;
  label: string;
  ok: boolean;
  latencyMs: number | null;
  tps: number | null;
  total: number | null;
}

export function rankGroups(rows: RankInput[]): RankEntry[] {
  const acc = new Map<string, { label: string; runs: number; ok: number; lat: (number | null)[]; tps: (number | null)[]; tok: number }>();
  for (const r of rows) {
    const e = acc.get(r.key) ?? { label: r.label, runs: 0, ok: 0, lat: [], tps: [], tok: 0 };
    e.runs += 1;
    if (r.ok) e.ok += 1;
    e.lat.push(r.latencyMs);
    e.tps.push(r.tps);
    e.tok += r.total ?? 0;
    acc.set(r.key, e);
  }
  const out: RankEntry[] = [...acc.entries()].map(([key, e]) => ({
    key,
    label: e.label,
    runs: e.runs,
    successPct: Math.round((e.ok / e.runs) * 1000) / 10,
    avgLatencyMs: avg(e.lat),
    avgTps: avg(e.tps),
    totalTokens: e.tok
  }));
  // Best-first: sukses% → tok/s (NULL terakhir) → jumlah runs.
  out.sort(
    (a, b) =>
      b.successPct - a.successPct ||
      (b.avgTps ?? -1) - (a.avgTps ?? -1) ||
      b.runs - a.runs
  );
  return out;
}

export function rankProviders(runs: LabRunRow[]): RankEntry[] {
  return rankGroups(
    runs.map((r) => ({
      key: r.provider_slug || '(?)',
      label: r.provider_slug || '?',
      ok: !r.error,
      latencyMs: r.latency_ms,
      tps: r.tokens_per_sec,
      total: r.total_tokens
    }))
  );
}

export function rankModels(runs: LabRunRow[]): RankEntry[] {
  return rankGroups(
    runs.map((r) => ({
      key: r.model_slug || '(?)',
      label: `${r.provider_slug || '?'} / ${(r.model_slug || '').split('/').pop() || '?'}`,
      ok: !r.error,
      latencyMs: r.latency_ms,
      tps: r.tokens_per_sec,
      total: r.total_tokens
    }))
  );
}

/** Format ringkas 1200 -> "1,2 rb" (id) / "1.2K" (en). */
export function formatCompact(n: number, locale: 'id' | 'en'): string {
  return new Intl.NumberFormat(locale === 'id' ? 'id-ID' : 'en-US', {
    notation: 'compact',
    maximumFractionDigits: 1
  }).format(n);
}
