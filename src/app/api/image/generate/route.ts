import { NextResponse } from 'next/server';
import { isCronAuthorized } from '@/lib/content/cron-auth';
import { processImageTick } from '@/lib/image/worker';

export const maxDuration = 300;

/** Cron worker image: 1 generate manual (prioritas) + 1 reasoning cover per tick. */
async function handle(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const result = await processImageTick();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: message.slice(0, 300) }, { status: 500 });
  }
}

export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}
