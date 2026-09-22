import 'server-only';
import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

export type ErrorCategory = 'tavily' | 'llm' | 'research' | 'automation' | 'scrape' | 'cron_api' | 'resend' | 'image';
export type ErrorSeverity = 'warning' | 'error' | 'critical';

export interface ErrorEventInput {
  category: ErrorCategory;
  source: string;
  severity?: ErrorSeverity;
  stage?: string | null;
  message: string;
  details?: Record<string, unknown>;
  sessionId?: string | null;
  runId?: string | null;
}

const ERROR_CATEGORIES: readonly ErrorCategory[] = [
  'tavily', 'llm', 'research', 'automation',
  'scrape', 'cron_api', 'resend', 'image'
];

function normalizeMessage(msg: string): string {
  return msg
    .toLowerCase()
    .replace(/[0-9a-f]{8}-[0-9a-f-]{4,}/gi, '#id')
    .replace(/(?:tvly-|re_[A-Za-z0-9]{5,}|sk-[A-Za-z0-9]{5,})/gi, '#key')
    .replace(/\b[a-f0-9]{16,}\b/gi, '#hex')
    .replace(/\d+/g, '#n')
    .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?/g, '#ts')
    .trim()
    .slice(0, 200);
}

export function buildFingerprint(
  category: string,
  source: string,
  stage: string | null,
  message: string
): string {
  const normalized = normalizeMessage(message);
  const raw = `${category}|${source}|${stage ?? ''}|${normalized}`;
  return createHash('sha1').update(raw).digest('hex').slice(0, 16);
}

function safeJsonSerialize(obj: unknown): Record<string, unknown> {
  if (obj == null) return {};
  if (typeof obj === 'string' || typeof obj === 'number' || typeof obj === 'boolean') return { _raw: obj };
  try {
    return JSON.parse(JSON.stringify(obj)) as Record<string, unknown>;
  } catch {
    return { _raw: String(obj).slice(0, 500) };
  }
}

export async function reportError(
  supabase: SupabaseClient | null | undefined,
  input: ErrorEventInput
): Promise<void> {
  if (!supabase) return;
  try {
    if (!ERROR_CATEGORIES.includes(input.category)) return;
    const message = input.message.slice(0, 2000);
    const stage = input.stage ?? null;
    const fingerprint = buildFingerprint(input.category, input.source, stage, message);
    const details = safeJsonSerialize(input.details ?? {});
    await supabase.from('error_events').insert({
      category: input.category,
      source: input.source,
      severity: input.severity ?? 'error',
      stage,
      message,
      details,
      session_id: input.sessionId ?? null,
      run_id: input.runId ?? null,
      fingerprint
    });
  } catch {
    /* best-effort — kegagalan insert tidak boleh mengubah alur caller */
  }
}

export async function reportCronApiError(
  supabase: SupabaseClient,
  endpoint: '/api/content/process' | '/api/automation/run' | '/api/content/process-legacy',
  kind: 'unauthorized' | 'service_not_configured' | 'handler_error',
  message: string
): Promise<void> {
  await reportError(supabase, {
    category: 'cron_api',
    source: endpoint,
    severity: kind === 'unauthorized' ? 'warning' : 'error',
    stage: kind,
    message
  });
}
