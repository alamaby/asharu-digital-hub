import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth/require-user';
import { checkRateLimit, getClientIp, incrementRateLimit } from '@/lib/content/rate-limit';
import { chatRequestSchema, assertAllowedBaseUrl, sanitizeErrorMessage } from '@/lib/endpoint-try/validation';
import {
  buildOpenAIChatBody,
  buildAnthropicChatBody,
  normalizeOpenAIChat,
  normalizeAnthropicChat,
  tokensPerSec as computeTokensPerSec
} from '@/lib/endpoint-try/adapters';

export const maxDuration = 60;

async function fetchWithTimeout(url: string, init: RequestInit, ms: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function POST(request: Request) {
  // 1. Guard login (requireUser throws on failure).
  try {
    await requireUser();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg.slice(0, 300) }, { status: 401 });
  }

  // 2. Rate limit: 30/hour/IP.
  const ip = getClientIp(request.headers);
  const rl = await checkRateLimit(ip, 'endpoint_try', 30);
  if (!rl.allowed) {
    return NextResponse.json({ ok: false, error: 'Terlalu banyak permintaan — coba lagi nanti.' }, { status: 429 });
  }

  // 3. Parse JSON.
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Body harus JSON.' }, { status: 400 });
  }

  // 4. Validate schema.
  const parsed = chatRequestSchema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.errors?.[0];
    const message = first?.message ?? 'Format request tidak valid.';
    return NextResponse.json({ ok: false, error: message.slice(0, 300) }, { status: 400 });
  }
  const { kind, baseUrl, apiKey, model, system, user: prompt, temperature, maxTokens, stream } = parsed.data;

  // 5. SSRF guard.
  let origin: string;
  try {
    const r = assertAllowedBaseUrl(baseUrl);
    origin = r.origin;
  } catch (e) {
    const msg = sanitizeErrorMessage(e instanceof Error ? e.message : String(e), [apiKey]);
    void incrementRateLimit(ip, 'endpoint_try').catch(() => {});
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }

  // 6. Build messages (system terpisah untuk Anthropic).
  const effectiveMaxTokens = kind === 'anthropic' && maxTokens == null ? 1024 : maxTokens;
  const commonHeaders: Record<string, string> = { 'content-type': 'application/json' };
  if (kind === 'anthropic') {
    commonHeaders['x-api-key'] = apiKey;
    commonHeaders['anthropic-version'] = '2023-06-01';
  } else {
    commonHeaders['Authorization'] = `Bearer ${apiKey}`;
  }

  // 7. Proxy upstream.
  const startedAt = Date.now();
  let res: Response;
  try {
    let url: string;
    let body: Record<string, unknown>;
    if (kind === 'anthropic') {
      url = `${origin}/messages`;
      body = buildAnthropicChatBody({
        model,
        system: system ?? undefined,
        messages: [{ role: 'user', content: prompt }],
        temperature: temperature ?? undefined,
        maxTokens: effectiveMaxTokens ?? 1024,
        stream
      });
    } else {
      url = `${origin}/chat/completions`;
      const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [];
      if (system) messages.push({ role: 'system', content: system });
      messages.push({ role: 'user', content: prompt });
      body = buildOpenAIChatBody({
        model,
        messages,
        temperature: temperature ?? undefined,
        maxTokens: effectiveMaxTokens ?? undefined,
        stream
      });
    }
    res = await fetchWithTimeout(url, {
      method: 'POST',
      headers: commonHeaders,
      body: JSON.stringify(body)
    }, 55000);
  } catch (e) {
    const msg = e instanceof DOMException && e.name === 'AbortError'
      ? 'Upstream timeout (55 detik).'
      : sanitizeErrorMessage(e instanceof Error ? e.message : String(e), [apiKey]);
    void incrementRateLimit(ip, 'endpoint_try').catch(() => {});
    return NextResponse.json({ ok: false, error: msg }, { status: 502 });
  }

  // 8. Non-ok upstream → pasarkan pesan sanitized.
  if (!res.ok) {
    let text = '';
    try {
      text = (await res.text()).slice(0, 500);
    } catch {
      /* ignore */
    }
    const msg = sanitizeErrorMessage(`Upstream ${res.status}: ${text}`, [apiKey]);
    void incrementRateLimit(ip, 'endpoint_try').catch(() => {});
    return NextResponse.json({ ok: false, error: msg }, { status: 502 });
  }

  // 9. Stream vs non-stream.
  const contentType = res.headers.get('content-type') ?? '';
  if (stream && contentType.includes('text/event-stream')) {
    // Stream mode: teruskan body mentah ke client. Tanpa menyimpan key.
    void incrementRateLimit(ip, 'endpoint_try').catch(() => {});
    return new NextResponse(res.body, {
      status: 200,
      headers: {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
        connection: 'keep-alive',
        'x-endpoint-try-kind': kind
      }
    });
  }

  // Non-stream: baca fully, normalisasi, hitung metrik.
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    void incrementRateLimit(ip, 'endpoint_try').catch(() => {});
    return NextResponse.json({ ok: false, error: 'Upstream mengembalikan respons bukan JSON.' }, { status: 502 });
  }

  const latencyMs = Date.now() - startedAt;
  const normalized =
    kind === 'anthropic'
      ? normalizeAnthropicChat(json)
      : normalizeOpenAIChat(json);
  const tps = computeTokensPerSec(normalized.usage?.completionTokens ?? null, latencyMs);

  if (!normalized.text) {
    void incrementRateLimit(ip, 'endpoint_try').catch(() => {});
    return NextResponse.json({ ok: false, error: 'Upstream mengembalikan respons kosong.' }, { status: 502 });
  }

  await incrementRateLimit(ip, 'endpoint_try').catch(() => {});
  return NextResponse.json({
    ok: true,
    text: normalized.text,
    usage: normalized.usage,
    finishReason: normalized.finishReason,
    latencyMs,
    tokensPerSec: tps
  });
}
