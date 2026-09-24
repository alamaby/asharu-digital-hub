import { NextResponse } from 'next/server';
import { isCronAuthorized } from '@/lib/content/cron-auth';
import { cleanupExpiredLabBatches } from '@/lib/lab/actions';
import { cleanupExpiredEndpointTryRuns } from '@/lib/endpoint-try/actions';

export const maxDuration = 120;

/** Cron cleanup harian: hapus batch expired + run endpoint_try expired. */
async function handle(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const [batches, runs] = await Promise.all([
      cleanupExpiredLabBatches(),
      cleanupExpiredEndpointTryRuns()
    ]);
    return NextResponse.json({ ok: true, batchesDeleted: batches.deletedBatches, runsDeleted: runs.deletedRuns });
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
