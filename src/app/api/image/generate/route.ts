import { NextResponse } from 'next/server';
import { isCronAuthorized } from '@/lib/content/cron-auth';
import { processOneImage } from '@/lib/image/worker';

export const maxDuration = 300;

/** Cron worker image: klaim 1 pending (atau enqueue auto) per tick. */
async function handle(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const result = await processOneImage();
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
