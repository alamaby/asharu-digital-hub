import { NextRequest, NextResponse } from 'next/server';
import { isCronAuthorized } from '@/lib/content/cron-auth';
import { createSupabaseService } from '@/lib/supabase/server';
import { loadAutomationConfig } from '@/lib/automation/config';

// CPU hemat: poller idle <10s; kerja berat di-retry tick berikut (idempoten).
export const maxDuration = 120;

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
    const cfg = await loadAutomationConfig(supabase);
    if (!cfg) {
      return NextResponse.json({ ok: true, skipped: 'disabled', error: 'config automation belum ada' });
    }
    if (!cfg.isEnabled) {
      return NextResponse.json({ ok: true, skipped: 'disabled' });
    }
    const { runAutomationTick } = await import('@/lib/automation/runner');
    const result = await runAutomationTick(supabase);
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
