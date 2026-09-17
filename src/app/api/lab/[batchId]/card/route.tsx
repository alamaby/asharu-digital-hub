import { NextResponse } from 'next/server';
import { ImageResponse } from 'next/og';
import { createSupabaseServer } from '@/lib/supabase/server';
import { getLabBatch } from '@/lib/lab/actions';
import { findWinners } from '@/lib/lab/stats';

export const maxDuration = 60;

const W = 1080;
const H = 1080;

function shortModel(slug: string): string {
  const short = slug.split('/').pop() || slug || '?';
  return short.length > 34 ? `${short.slice(0, 33)}…` : short;
}

function metricsLine(r: {
  error: string | null;
  latency_ms: number | null;
  tokens_per_sec: number | null;
  total_tokens: number | null;
}): string {
  if (r.error) return 'gagal';
  const parts = [
    r.latency_ms === null ? '-ms' : `${r.latency_ms}ms`,
    r.tokens_per_sec === null ? '-' : `${r.tokens_per_sec} tok/s`,
    r.total_tokens === null ? '-' : `${r.total_tokens} token`
  ];
  return parts.join(' · ');
}

/**
 * Kartu share 1080×1080 (PNG) untuk 1 batch komparasi — login-required.
 * "Share" = unduh lalu unggah manual (crawler sosmed tak lewat login).
 */
export async function GET(_request: Request, { params }: { params: Promise<{ batchId: string }> }) {
  const { batchId } = await params;
  const supabase = await createSupabaseServer();
  if (!supabase) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let data;
  try {
    data = await getLabBatch(batchId);
  } catch {
    return NextResponse.json({ error: 'Batch tidak ditemukan.' }, { status: 404 });
  }

  const winners = findWinners(
    data.runs.map((r) => ({
      id: r.id,
      ok: !r.error,
      latencyMs: r.latency_ms,
      tps: r.tokens_per_sec,
      total: r.total_tokens
    }))
  );
  const prompt =
    data.batch.user_prompt.length > 160
      ? `${data.batch.user_prompt.slice(0, 159)}…`
      : data.batch.user_prompt;
  const date = new Date(data.batch.created_at).toISOString().slice(0, 10);

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          padding: 72,
          backgroundColor: '#075985',
          color: '#F8FAFC'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 16 }}>
          <span style={{ fontSize: 84, fontWeight: 700 }}>Chat Lab</span>
          <span style={{ fontSize: 64, color: '#F59E0B' }}>.</span>
        </div>
        <div style={{ fontSize: 30, marginTop: 8, color: '#BAE6FD' }}>asharu.id · {date}</div>
        <div
          style={{
            fontSize: 38,
            marginTop: 32,
            maxHeight: 200,
            overflow: 'hidden',
            lineHeight: 1.3
          }}
        >
          “{prompt}”
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20, marginTop: 40 }}>
          {data.runs.slice(0, 3).map((r) => {
            const isWin =
              winners.latency.includes(r.id) ||
              winners.speed.includes(r.id) ||
              winners.tokens.includes(r.id);
            return (
              <div
                key={r.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  backgroundColor: 'rgba(255,255,255,0.12)',
                  borderRadius: 20,
                  padding: '24px 32px'
                }}
              >
                <span style={{ fontSize: 40, fontWeight: 700 }}>
                  {isWin ? '★ ' : ''}
                  {r.provider_slug || '?'} / {shortModel(r.model_slug)}
                </span>
                <span style={{ fontSize: 32, color: isWin ? '#6EE7B7' : '#E0F2FE' }}>
                  {metricsLine(r)}
                </span>
              </div>
            );
          })}
        </div>
        <div style={{ fontSize: 28, marginTop: 'auto', color: '#BAE6FD' }}>
          Diuji di asharu.id/lab
        </div>
      </div>
    ),
    { width: W, height: H }
  );
}
