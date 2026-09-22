import { NextRequest, NextResponse } from 'next/server';
import { isCronAuthorized } from '@/lib/content/cron-auth';
import { createSupabaseService } from '@/lib/supabase/server';
import { reportError } from '@/lib/notifications/error-events';
import { z } from 'zod';

export const maxDuration = 30;

const reportSchema = z.object({
  category: z.enum(['tavily', 'llm', 'research', 'automation', 'scrape', 'cron_api', 'resend', 'image']),
  source: z.string().min(1).max(100),
  severity: z.enum(['warning', 'error', 'critical']).default('error'),
  stage: z.string().max(100).nullable().optional(),
  message: z.string().min(1).max(2000),
  details: z.record(z.unknown()).nullable().optional(),
  sessionId: z.string().max(100).nullable().optional(),
  runId: z.string().max(100).nullable().optional()
});

export async function POST(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const supabase = createSupabaseService();
  if (!supabase) {
    return NextResponse.json({ error: 'service not configured' }, { status: 500 });
  }
  let parsed: z.infer<typeof reportSchema>;
  try {
    const body = await request.json();
    parsed = reportSchema.parse(body);
  } catch {
    return NextResponse.json({ error: 'invalid payload' }, { status: 400 });
  }
  await reportError(supabase, { ...parsed, details: parsed.details ?? undefined });
  return NextResponse.json({ ok: true });
}
