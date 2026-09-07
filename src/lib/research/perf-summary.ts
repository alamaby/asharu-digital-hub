/**
 * Agregasi murni untuk panel Performa LLM & Search di detail riset.
 * Tanpa `server-only` agar bisa di-unit-test; dipanggil dari RSC.
 */

export interface LlmCallRow {
  provider_slug: string;
  model_id: string;
  stage: string | null;
  latency_ms: number | null;
  http_status: number | null;
  error: string | null;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  total_tokens: number | null;
  finish_reason: string | null;
  is_fallback: boolean | null;
}

export interface LlmCallDatum {
  label: string;
  stage: string;
  prompt: number;
  completion: number;
  latencyMs: number | null;
  ok: boolean;
  fallback: boolean;
  httpStatus: number | null;
  finishReason: string | null;
  error: string | null;
}

export interface LlmSummary {
  calls: number;
  okCount: number;
  errors: number;
  fallbacks: number;
  promptTotal: number;
  completionTotal: number;
  tokenTotal: number;
  avgLatencyMs: number | null;
  byCall: LlmCallDatum[];
}

export function summarizeLlmLogs(rows: LlmCallRow[]): LlmSummary {
  const byCall: LlmCallDatum[] = rows.map((r) => ({
    label: `${r.provider_slug}/${r.model_id}`,
    stage: r.stage ?? '-',
    prompt: r.prompt_tokens ?? 0,
    completion: r.completion_tokens ?? 0,
    latencyMs: r.latency_ms,
    ok: !r.error,
    fallback: r.is_fallback === true,
    httpStatus: r.http_status,
    finishReason: r.finish_reason,
    error: r.error
  }));
  const latencies = rows.map((r) => r.latency_ms).filter((v): v is number => typeof v === 'number');
  return {
    calls: rows.length,
    okCount: rows.filter((r) => !r.error).length,
    errors: rows.filter((r) => r.error).length,
    fallbacks: rows.filter((r) => r.is_fallback === true).length,
    promptTotal: rows.reduce((a, r) => a + (r.prompt_tokens ?? 0), 0),
    completionTotal: rows.reduce((a, r) => a + (r.completion_tokens ?? 0), 0),
    tokenTotal: rows.reduce((a, r) => a + (r.total_tokens ?? (r.prompt_tokens ?? 0) + (r.completion_tokens ?? 0)), 0),
    avgLatencyMs: latencies.length > 0 ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : null,
    byCall
  };
}

export interface SearchCallRow {
  provider_slug: string;
  operation: string;
  query_count: number | null;
  latency_ms: number | null;
  result_count: number | null;
  http_status: number | null;
  error: string | null;
}

export interface SearchCallDatum {
  label: string;
  queries: number;
  results: number;
  latencyMs: number | null;
  ok: boolean;
  httpStatus: number | null;
  error: string | null;
}

export interface SearchSummary {
  calls: number;
  errors: number;
  queries: number;
  results: number;
  avgLatencyMs: number | null;
  byCall: SearchCallDatum[];
}

export function summarizeSearchLogs(rows: SearchCallRow[]): SearchSummary {
  const latencies = rows.map((r) => r.latency_ms).filter((v): v is number => typeof v === 'number');
  return {
    calls: rows.length,
    errors: rows.filter((r) => r.error).length,
    queries: rows.reduce((a, r) => a + (r.query_count ?? 0), 0),
    results: rows.reduce((a, r) => a + (r.result_count ?? 0), 0),
    avgLatencyMs: latencies.length > 0 ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : null,
    byCall: rows.map((r) => ({
      label: `${r.provider_slug}/${r.operation}`,
      queries: r.query_count ?? 0,
      results: r.result_count ?? 0,
      latencyMs: r.latency_ms,
      ok: !r.error,
      httpStatus: r.http_status,
      error: r.error
    }))
  };
}

/** Angka ringkas sesuai locale, mis. 12.400 → "12 rb" (id) / "12K" (en). */
export function formatCompact(n: number, locale: 'id' | 'en' = 'id'): string {
  return new Intl.NumberFormat(locale, { notation: 'compact' }).format(n);
}
