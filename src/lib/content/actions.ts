'use server';

import { z } from 'zod';
import { headers } from 'next/headers';
import { createClient } from '@supabase/supabase-js';
import { checkRateLimit, getClientIp, incrementRateLimit } from './rate-limit';

const requestSchema = z.object({
  topic: z.string().min(10).max(500),
  platform: z.string().min(1),
  tone: z.enum(['casual', 'formal', 'witty', 'professional', 'friendly', 'edukatif']),
  targetCategory: z.string().optional(),
  audience: z.string().min(3).max(200),
  ctaStyle: z.string().min(1),
  purpose: z.string().min(3).max(200),
  constraints: z.string().max(500).optional(),
  keywords: z.string().max(200).optional(),
  language: z.enum(['id', 'en', 'both']),
  website: z.string().optional() // honeypot
});

export interface ActionResult {
  success: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
  sessionId?: string;
}

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase service credentials missing (set SUPABASE_SECRET_KEY)');
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function createContentRequest(formData: FormData): Promise<ActionResult> {
  const raw = Object.fromEntries(formData.entries()) as Record<string, string>;

  // Honeypot
  if (raw.website && raw.website.trim() !== '') {
    return { success: false, error: 'honeypot' };
  }

  // Normalize empty targetCategory
  if (raw.targetCategory === '' || raw.targetCategory === 'all') {
    raw.targetCategory = undefined as unknown as string;
  }
  if (raw.constraints === '') raw.constraints = undefined as unknown as string;
  if (raw.keywords === '') raw.keywords = undefined as unknown as string;

  const parsed = requestSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.join('.') || 'form';
      fieldErrors[key] = issue.message;
    }
    return { success: false, fieldErrors, error: 'validation' };
  }

  // Rate limit
  const hdrs = await headers();
  const ip = getClientIp(hdrs);
  const { allowed, count } = await checkRateLimit(ip);
  if (!allowed) {
    return { success: false, error: `rate_limit:${count}` };
  }

  const supabase = getServiceClient();

  // Validate platform exists
  const { data: platform } = await supabase.from('platforms').select('slug').eq('slug', parsed.data.platform).maybeSingle();
  if (!platform) {
    return { success: false, fieldErrors: { platform: 'Platform tidak valid' }, error: 'validation' };
  }

  const { error } = await supabase.from('content_requests').insert({
    topic: parsed.data.topic,
    platform_slug: parsed.data.platform,
    tone: parsed.data.tone,
    target_category: parsed.data.targetCategory || null,
    audience: parsed.data.audience,
    cta_style: parsed.data.ctaStyle,
    purpose: parsed.data.purpose,
    constraints: parsed.data.constraints || null,
    keywords: parsed.data.keywords || null,
    language: parsed.data.language,
    status: 'pending'
  });

  if (error) {
    return { success: false, error: error.message };
  }

  await incrementRateLimit(ip);
  return { success: true };
}

const researchSchema = z.object({
  topic: z.string().min(10).max(500),
  platform: z.string().min(1),
  tone: z.enum(['casual', 'formal', 'witty', 'professional', 'friendly', 'edukatif']),
  targetCategory: z.string().optional(),
  audience: z.string().min(3).max(200),
  ctaStyle: z.string().min(1),
  purpose: z.string().min(3).max(200),
  constraints: z.string().max(500).optional(),
  keywords: z.string().max(200).optional(),
  language: z.enum(['id', 'en', 'both']),
  // Research-only fields (all optional; defaults applied server-side).
  targetLocation: z.string().max(120).optional(),
  secondaryLocation: z.string().max(120).optional(),
  audienceAge: z.string().max(60).optional(),
  audienceInterests: z.string().max(500).optional(),
  accountGoal: z.string().max(200).optional(),
  allowedCategories: z.string().max(500).optional(),
  excludedCategories: z.string().max(500).optional(),
  freshnessHours: z.coerce.number().int().min(1).max(720).optional(),
  minimumCandidates: z.coerce.number().int().min(3).max(50).optional(),
  minimumScore: z.coerce.number().min(0).max(10).optional(),
  requiredWinners: z.coerce.number().int().min(1).max(10).optional(),
  maximumIterations: z.coerce.number().int().min(1).max(10).optional(),
  website: z.string().optional() // honeypot
});

function splitCsv(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function normalizeEmpty(raw: Record<string, string>, key: string): void {
  if (raw[key] === '' || raw[key] === 'all') {
    raw[key] = undefined as unknown as string;
  }
}

/**
 * Create a research session. Equivalent to createContentRequest but
 * inserts into `content_research_sessions` and accepts the additional
 * research-pipeline fields (target_location, audience params, scoring
 * controls, etc).
 */
export async function createResearchSession(formData: FormData): Promise<ActionResult> {
  const raw = Object.fromEntries(formData.entries()) as Record<string, string>;

  if (raw.website && raw.website.trim() !== '') {
    return { success: false, error: 'honeypot' };
  }

  normalizeEmpty(raw, 'targetCategory');
  for (const k of [
    'constraints',
    'keywords',
    'targetLocation',
    'secondaryLocation',
    'audienceAge',
    'audienceInterests',
    'accountGoal',
    'allowedCategories',
    'excludedCategories'
  ]) {
    if (raw[k] === '') raw[k] = undefined as unknown as string;
  }

  const parsed = researchSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.join('.') || 'form';
      fieldErrors[key] = issue.message;
    }
    return { success: false, fieldErrors, error: 'validation' };
  }

  const hdrs = await headers();
  const ip = getClientIp(hdrs);
  const { allowed, count } = await checkRateLimit(ip);
  if (!allowed) {
    return { success: false, error: `rate_limit:${count}` };
  }

  const supabase = getServiceClient();
  const data = parsed.data;

  const { data: platform } = await supabase
    .from('platforms')
    .select('slug')
    .eq('slug', data.platform)
    .maybeSingle();
  if (!platform) {
    return { success: false, fieldErrors: { platform: 'Platform tidak valid' }, error: 'validation' };
  }

  // created_by is the signed-in user if any; null for anonymous submit.
  const {
    data: { user }
  } = await supabase.auth.getUser();

  const { data: inserted, error } = await supabase
    .from('content_research_sessions')
    .insert({
      status: 'pending',
      target_location: data.targetLocation ?? null,
      secondary_location: data.secondaryLocation ?? null,
      audience_age: data.audienceAge ?? data.audience,
      audience_interests: splitCsv(data.audienceInterests),
      platform_slug: data.platform,
      tone: data.tone,
      account_goal: data.accountGoal ?? data.purpose,
      allowed_categories: splitCsv(data.allowedCategories),
      excluded_categories: splitCsv(data.excludedCategories),
      freshness_hours: data.freshnessHours ?? 24,
      minimum_candidates: data.minimumCandidates ?? 12,
      minimum_score: data.minimumScore ?? 6.0,
      required_winners: data.requiredWinners ?? 3,
      maximum_iterations: data.maximumIterations ?? 3,
      created_by: user?.id ?? null
    })
    .select('id')
    .single();

  if (error || !inserted) {
    return { success: false, error: error?.message ?? 'insert failed' };
  }

  await incrementRateLimit(ip);
  return { success: true, sessionId: (inserted as { id: string }).id };
}
