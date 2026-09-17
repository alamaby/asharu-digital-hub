import type { LabRunRow } from './types';

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
  /** Per-run untuk chart (diurutkan pemanggil). */
  byRun: {
    label: string;
    provider: string;
    model: string;
    prompt: number;
    completion: number;
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
    byRun: runs.map((r) => ({
      label: `${r.provider_slug || '?'} / ${(r.model_slug || '').split('/').pop() || '?'}`,
      provider: r.provider_slug,
      model: r.model_slug,
      prompt: r.prompt_tokens ?? 0,
      completion: r.completion_tokens ?? 0,
      latencyMs: r.latency_ms,
      tps: r.tokens_per_sec,
      ok: !r.error,
      fallback: r.is_fallback,
      createdAt: r.created_at
    }))
  };
}

/** Format ringkas 1200 -> "1,2 rb" (id) / "1.2K" (en). */
export function formatCompact(n: number, locale: 'id' | 'en'): string {
  return new Intl.NumberFormat(locale === 'id' ? 'id-ID' : 'en-US', {
    notation: 'compact',
    maximumFractionDigits: 1
  }).format(n);
}
