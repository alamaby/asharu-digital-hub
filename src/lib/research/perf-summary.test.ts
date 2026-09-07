import { describe, expect, it } from 'vitest';
import { formatCompact, summarizeLlmLogs, summarizeSearchLogs } from './perf-summary';

describe('summarizeLlmLogs', () => {
  it('returns zeros for empty input', () => {
    const s = summarizeLlmLogs([]);
    expect(s).toMatchObject({
      calls: 0,
      okCount: 0,
      errors: 0,
      fallbacks: 0,
      promptTotal: 0,
      completionTotal: 0,
      tokenTotal: 0,
      avgLatencyMs: null,
      byCall: []
    });
  });

  it('sums tokens, counts errors/fallbacks, averages latency', () => {
    const s = summarizeLlmLogs([
      { provider_slug: 'gemini', model_id: 'a', stage: 'discovering', latency_ms: 1000, http_status: 200, error: null, prompt_tokens: 100, completion_tokens: 50, total_tokens: 150, finish_reason: 'STOP', is_fallback: false },
      { provider_slug: 'openrouter', model_id: 'b', stage: 'scoring', latency_ms: 3000, http_status: 500, error: 'boom', prompt_tokens: null, completion_tokens: null, total_tokens: null, finish_reason: null, is_fallback: true }
    ]);
    expect(s.calls).toBe(2);
    expect(s.okCount).toBe(1);
    expect(s.errors).toBe(1);
    expect(s.fallbacks).toBe(1);
    expect(s.promptTotal).toBe(100);
    expect(s.completionTotal).toBe(50);
    expect(s.tokenTotal).toBe(150);
    expect(s.avgLatencyMs).toBe(2000);
    expect(s.byCall[0]).toMatchObject({ label: 'gemini/a', stage: 'discovering', ok: true });
    expect(s.byCall[1]).toMatchObject({ ok: false, fallback: true });
  });

  it('falls back to prompt+completion when total_tokens is null', () => {
    const s = summarizeLlmLogs([
      { provider_slug: 'cf', model_id: 'c', stage: null, latency_ms: null, http_status: null, error: null, prompt_tokens: 10, completion_tokens: 20, total_tokens: null, finish_reason: null, is_fallback: null }
    ]);
    expect(s.tokenTotal).toBe(30);
    expect(s.avgLatencyMs).toBeNull();
  });
});

describe('summarizeSearchLogs', () => {
  it('aggregates queries/results and latency', () => {
    const s = summarizeSearchLogs([
      { provider_slug: 'tavily', operation: 'search', query_count: 5, latency_ms: 1200, result_count: 33, http_status: 200, error: null },
      { provider_slug: 'tavily', operation: 'search', query_count: 2, latency_ms: null, result_count: 0, http_status: null, error: 'timeout' }
    ]);
    expect(s).toMatchObject({ calls: 2, errors: 1, queries: 7, results: 33, avgLatencyMs: 1200 });
    expect(s.byCall[0]).toMatchObject({ label: 'tavily/search', ok: true });
  });
});

describe('formatCompact', () => {
  it('compacts thousands per locale', () => {
    expect(formatCompact(12400, 'id')).toContain('rb');
    expect(formatCompact(12400, 'en')).toContain('K');
    expect(formatCompact(42, 'id')).toBe('42');
  });
});
