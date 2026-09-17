import { describe, expect, it } from 'vitest';
import { batchThroughput, summarizeLabRuns, tokensPerSec } from './stats';
import type { LabRunRow } from './types';

function run(over: Partial<LabRunRow>): LabRunRow {
  return {
    id: 'r',
    batch_id: 'b',
    user_id: 'u',
    provider_id: null,
    model_id: null,
    provider_slug: 'naraya',
    model_slug: 'naraya/model-a',
    prompt_tokens: null,
    completion_tokens: null,
    total_tokens: null,
    thought_tokens: null,
    latency_ms: null,
    tokens_per_sec: null,
    ttft_ms: null,
    finish_reason: null,
    is_fallback: false,
    response_truncated: false,
    http_status: 200,
    error: null,
    request_messages: null,
    response_text: 'ok',
    expires_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    ...over
  };
}

describe('tokensPerSec', () => {
  it('menghitung completion/latency', () => {
    expect(tokensPerSec(100, 2000)).toBe(50);
    expect(tokensPerSec(150, 1000)).toBe(150);
  });

  it('NULL bila token/latency tak diketahui (mis. Cloudflare tanpa usage)', () => {
    expect(tokensPerSec(null, 2000)).toBeNull();
    expect(tokensPerSec(100, null)).toBeNull();
    expect(tokensPerSec(100, 0)).toBeNull();
  });
});

describe('batchThroughput', () => {
  it('Σtotal / latency_terlama', () => {
    expect(
      batchThroughput([
        { total_tokens: 100, latency_ms: 1000 },
        { total_tokens: 200, latency_ms: 2000 }
      ])
    ).toBe(150);
  });

  it('NULL bila tak ada data', () => {
    expect(batchThroughput([])).toBeNull();
    expect(
      batchThroughput([
        { total_tokens: null, latency_ms: null }
      ])
    ).toBeNull();
  });
});

describe('summarizeLabRuns', () => {
  it('agregat ok/error/token/latency/success', () => {
    const s = summarizeLabRuns(2, [
      run({ prompt_tokens: 10, completion_tokens: 20, total_tokens: 30, latency_ms: 1000, tokens_per_sec: 20 }),
      run({ prompt_tokens: 5, completion_tokens: 5, total_tokens: 10, latency_ms: 2000, tokens_per_sec: 2.5, is_fallback: true }),
      run({ error: 'boom', response_text: null, http_status: 500, latency_ms: null, tokens_per_sec: null })
    ]);
    expect(s.batches).toBe(2);
    expect(s.runs).toBe(3);
    expect(s.ok).toBe(2);
    expect(s.errors).toBe(1);
    expect(s.fallbacks).toBe(1);
    expect(s.promptTotal).toBe(15);
    expect(s.completionTotal).toBe(25);
    expect(s.tokenTotal).toBe(40);
    expect(s.avgLatencyMs).toBe(1500);
    expect(s.avgTokensPerSec).toBe(11.25);
    expect(s.successPct).toBe(66.7);
    expect(s.byRun).toHaveLength(3);
  });

  it('kosong = nol + null aman', () => {
    const s = summarizeLabRuns(0, []);
    expect(s.runs).toBe(0);
    expect(s.avgLatencyMs).toBeNull();
    expect(s.successPct).toBeNull();
  });
});
