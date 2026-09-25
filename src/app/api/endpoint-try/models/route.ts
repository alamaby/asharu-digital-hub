import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth/require-user';
import { checkRateLimit, getClientIp, incrementRateLimit } from '@/lib/content/rate-limit';
import { modelsRequestSchema, assertAllowedBaseUrl, joinUpstreamPath, sanitizeErrorMessage } from '@/lib/endpoint-try/validation';
import { normalizeOpenAIModels, normalizeAnthropicModels } from '@/lib/endpoint-try/adapters';

export const maxDuration = 30;

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
  // 1. Guard login (requireUser throws on failure; we swallow here).
  try {
    await requireUser();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg.slice(0, 300) }, { status: 401 });
  }

  // 2. Rate limit: 30 requests/hour per IP.
  const ip = getClientIp(request.headers);
  const rl = await checkRateLimit(ip, 'endpoint_try', 30);
  if (!rl.allowed) {
    return NextResponse.json({ ok: false, error: 'Terlalu banyak permintaan — coba lagi nanti.' }, { status: 429 });
  }

  // 3. Parse body JSON.
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Body harus JSON.' }, { status: 400 });
  }

  // 4. Validate schema.
  const parsed = modelsRequestSchema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.errors?.[0];
    const message = first?.message ?? 'Format request tidak valid.';
    return NextResponse.json({ ok: false, error: message.slice(0, 300) }, { status: 400 });
  }
  const { kind, baseUrl, apiKey } = parsed.data;

  // 5. SSRF guard. Prefix path baseUrl dipertahankan (mis. /paid/v1).
  let upstreamBase: string;
  try {
    const r = assertAllowedBaseUrl(baseUrl);
    upstreamBase = r.base;
  } catch (e) {
    const msg = sanitizeErrorMessage(e instanceof Error ? e.message : String(e), [apiKey]);
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }

  // 6. Proxy upstream GET /models.
  const startedAt = Date.now();
  let res: Response;
  try {
    const headers: Record<string, string> = {};
    if (kind === 'anthropic') {
      headers['x-api-key'] = apiKey;
      headers['anthropic-version'] = '2023-06-01';
    } else {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }
    res = await fetchWithTimeout(joinUpstreamPath(upstreamBase, '/models'), { method: 'GET', headers }, 25000);
  } catch (e) {
    const msg = e instanceof DOMException && e.name === 'AbortError'
      ? 'Upstream timeout (25 detik).'
      : sanitizeErrorMessage(e instanceof Error ? e.message : String(e), [apiKey]);
    void incrementRateLimit(ip, 'endpoint_try').catch(() => {});
    return NextResponse.json({ ok: false, error: msg }, { status: 502 });
  }

  // 7. Non-ok upstream → pasarkan pesan sanitized.
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

  // 8. Parse JSON response.
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    void incrementRateLimit(ip, 'endpoint_try').catch(() => {});
    return NextResponse.json({ ok: false, error: 'Upstream mengembalikan respons bukan JSON.' }, { status: 502 });
  }

  // 9. Normalize model list.
  const latencyMs = Date.now() - startedAt;
  let models: Array<{ id: string; ownedBy: string | null }> = [];
  if (kind === 'anthropic') {
    models = normalizeAnthropicModels(json);
  } else {
    models = normalizeOpenAIModels(json);
  }

  await incrementRateLimit(ip, 'endpoint_try').catch(() => {});
  return NextResponse.json({ ok: true, models, latencyMs });
}
