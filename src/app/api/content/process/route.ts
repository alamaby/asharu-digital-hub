import { NextRequest, NextResponse } from 'next/server';
import { isCronAuthorized } from '@/lib/content/cron-auth';
import { createSupabaseService } from '@/lib/supabase/server';
import { advancePendingSessions } from '@/lib/research/orchestrator';

export const maxDuration = 300;

export async function POST(request: NextRequest) {
  return handle(request);
}

export async function GET(request: NextRequest) {
  return handle(request);
}

async function handle(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const supabase = createSupabaseService();
  if (!supabase) {
    return NextResponse.json({ error: 'service not configured' }, { status: 500 });
  }
  try {
    const advanced = await advancePendingSessions(supabase, 5);
    return NextResponse.json({ advanced });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
