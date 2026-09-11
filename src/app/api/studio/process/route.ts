import { NextResponse } from 'next/server';
import { isCronAuthorized } from '@/lib/content/cron-auth';
import { processOneStudioImage } from '@/lib/studio/worker';

export const maxDuration = 300;

const MAX_PER_TICK = 5;

/** Cron worker studio: proses hingga 5 antrean pending per tick. */
async function handle(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const processed: string[] = [];
  let lastError: string | null = null;
  for (let i = 0; i < MAX_PER_TICK; i += 1) {
    try {
      const result = await processOneStudioImage();
      if (!result.imageId) {
        if (result.error) lastError = result.error;
        break;
      }
      processed.push(result.imageId);
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
      break;
    }
  }
  return NextResponse.json({ ok: true, processed, count: processed.length, lastError });
}

export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}
