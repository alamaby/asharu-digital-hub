import { NextResponse } from 'next/server';
import { isCronAuthorized } from '@/lib/content/cron-auth';
import { cleanupExpiredRateLimits } from '@/lib/content/rate-limit';
import { cleanupExpiredLabBatches } from '@/lib/lab/actions';
import { cleanupExpiredEndpointTryRuns } from '@/lib/endpoint-try/actions';

export const maxDuration = 120;

/** Cron cleanup harian: batch expired + run endpoint_try expired + rate_limits basi. */
async function handle(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const [batches, runs, rateLimits] = await Promise.all([
      cleanupExpiredLabBatches(),
      cleanupExpiredEndpointTryRuns(),
      cleanupExpiredRateLimits()
    ]);
    return NextResponse.json({
      ok: true,
      batchesDeleted: batches.deletedBatches,
      runsDeleted: runs.deletedRuns,
      rateLimitsDeleted: rateLimits.deleted
    });
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
