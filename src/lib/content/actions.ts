'use server';

import { z } from 'zod';
import { headers } from 'next/headers';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { checkRateLimit, getClientIp, incrementRateLimit } from './rate-limit';
import { isAdmin } from '@/lib/auth/is-admin';

const requestSchema = z.object({
  topic: z.string().min(10).max(500),
  platform: z.string().min(1),
  tone: z.enum(['casual', 'formal', 'witty', 'professional', 'friendly', 'edukatif']),
  targetCategory: z.enum(['automotive', 'electronics', 'home-living', 'fashion', 'sports-hobby', 'others']).optional(),
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
  targetCategory: z.enum(['automotive', 'electronics', 'home-living', 'fashion', 'sports-hobby', 'others']).optional(),
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
  targetReplyCount: z.coerce.number().int().min(1).max(10).optional(),
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
  // Numeric optional fields: empty string must become undefined, otherwise z.coerce.number("") -> 0 fails min()
  for (const k of ['freshnessHours', 'minimumCandidates', 'minimumScore', 'requiredWinners', 'maximumIterations', 'targetReplyCount']) {
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

  // 'all' means platform-agnostic — skip FK check and store NULL.
  // content_research_sessions.platform_slug is nullable; downstream pipeline
  // branches on platform === 'all' (or null) to use platform-agnostic prompts.
  const isAllPlatforms = data.platform === 'all';
  if (!isAllPlatforms) {
    const { data: platform } = await supabase
      .from('platforms')
      .select('slug')
      .eq('slug', data.platform)
      .maybeSingle();
    if (!platform) {
      return { success: false, fieldErrors: { platform: 'Platform tidak valid' }, error: 'validation' };
    }
  }

  // created_by is the signed-in user if any; null for anonymous submit.
  const {
    data: { user }
  } = await supabase.auth.getUser();

  const { data: inserted, error } = await supabase
    .from('content_research_sessions')
    .insert({
      status: 'pending',
      topic: data.topic,
      language: data.language,
      target_category: data.targetCategory ?? null,
      audience: data.audience,
      cta_style: data.ctaStyle,
      purpose: data.purpose,
      constraints: data.constraints ?? null,
      keywords: data.keywords ?? null,
      target_location: data.targetLocation ?? null,
      secondary_location: data.secondaryLocation ?? null,
      audience_age: data.audienceAge ?? data.audience,
      audience_interests: splitCsv(data.audienceInterests),
      platform_slug: isAllPlatforms ? null : data.platform,
      tone: data.tone,
      account_goal: data.accountGoal ?? data.purpose,
      allowed_categories: splitCsv(data.allowedCategories),
      excluded_categories: splitCsv(data.excludedCategories),
      freshness_hours: data.freshnessHours ?? 24,
      minimum_candidates: data.minimumCandidates ?? 12,
      minimum_score: data.minimumScore ?? 6.0,
      required_winners: data.requiredWinners ?? 3,
      maximum_iterations: data.maximumIterations ?? 3,
      target_reply_count: data.targetReplyCount ?? null,
      created_by: user?.id ?? null
    } as unknown as Record<string, unknown>)
    .select('id')
    .single();

  if (error || !inserted) {
    return { success: false, error: error?.message ?? 'insert failed' };
  }

  await incrementRateLimit(ip);
  return { success: true, sessionId: (inserted as { id: string }).id };
}

/* ------------------------------------------------------------------ */
/* Admin actions: research session management                         */
/* ------------------------------------------------------------------ */

export interface GenerateIdeaResult {
  success: boolean;
  idea?: {
    topic: string;
    platform?: string;
    tone?: string;
    language?: string;
    targetCategory?: string;
    audience?: string;
    ctaStyle?: string;
    purpose?: string;
    constraints?: string;
    keywords?: string;
    targetLocation?: string;
    secondaryLocation?: string;
    audienceAge?: string;
    audienceInterests?: string;
    accountGoal?: string;
    allowedCategories?: string;
    excludedCategories?: string;
  };
  error?: string;
  fieldErrors?: Record<string, string>;
}

/**
 * Generate content idea via LLM — fills all form fields.
 * Lightweight, no Tavily, no DB insert. Rate limit 30/hour per IP.
 * Uses the shared LLM provider pool (DB-driven, round-robin).
 */
export async function generateIdea(formData: FormData): Promise<GenerateIdeaResult> {
  const raw = Object.fromEntries(formData.entries()) as Record<string, string>;
  const hdrs = await headers();
  const ip = getClientIp(hdrs);
  const { allowed, count } = await checkRateLimit(ip, 'generate_idea', 30);
  if (!allowed) {
    return { success: false, error: `rate_limit:${count}` };
  }

  const platformHint = (raw.platform ?? 'all').trim() || 'all';
  const toneHint = (raw.tone ?? '').trim();
  const languageHint = (raw.language ?? 'both').trim() || 'both';
  const targetLocationHint = (raw.targetLocation ?? '').trim();
  const currentHints = [platformHint, toneHint, languageHint, targetLocationHint].filter(Boolean).join(', ');

  // Build prompt — lightweight idea generator
  const system = `Anda adalah Content Idea Generator untuk Asharu (asharu.id). Tugas: buat 1 ide konten afiliasi yang siap isi form.
WAJIB kembalikan JSON valid tanpa teks tambahan dengan schema:
{
  "topic": "judul topik 10-500 karakter, hook kuat",
  "platform": "threads|twitter|instagram|tiktok|linkedin|facebook|all",
  "tone": "casual|formal|witty|professional|friendly|edukatif",
  "language": "id|en|both",
  "targetCategory": "automotive|electronics|home-living|fashion|sports-hobby|others",
  "audience": "deskripsi audiens 3-200 karakter",
  "ctaStyle": "soft_sell|hard_sell|question|urgency|storytelling",
  "purpose": "tujuan konten 3-200 karakter",
  "constraints": "batasan opsional max 500",
  "keywords": "kata kunci pisah koma max 200",
  "targetLocation": "lokasi utama",
  "secondaryLocation": "lokasi sekunder opsional",
  "audienceAge": "rentang usia",
  "audienceInterests": "minat pisah koma",
  "accountGoal": "tujuan akun",
  "allowedCategories": "kategori diperbolehkan pisah koma",
  "excludedCategories": "kategori dihindari pisah koma"
}
Aturan: topic harus 10-500 char, jangan asal; sesuaikan dengan hint platform/tone jika diberikan. Bahasa output ${languageHint}.`;
  const user = `Hint saat ini: platform=${platformHint}, tone=${toneHint || '-'}, language=${languageHint}, lokasi=${targetLocationHint || 'Indonesia'}${currentHints ? ` (${currentHints})` : ''}.
Berikan 1 ide terbaik sesuai schema. Pastikan semua field terisi natural, jangan kosongkan topic/audience/purpose. Keywords relevan dengan topic.`;

  // Use service client for LLM pool (bypasses RLS)
  const supabaseService = getServiceClient();
  const { runLLMCompletion } = await import('@/lib/llm/completion');
  let text = '';
  try {
    const result = await runLLMCompletion(supabaseService, {
      requestId: `idea-${Date.now()}`,
      stage: 'idea_generation',
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user }
      ],
      temperature: 0.85,
      maxTokens: 900
    });
    text = result.output.text;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { success: false, error: msg.slice(0, 500) };
  }

  // Parse JSON with fallbacks (strip markdown fences, extract object)
  let parsed: Record<string, unknown> | null = null;
  try {
    const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    parsed = JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    const m = text.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        parsed = JSON.parse(m[0]) as Record<string, unknown>;
      } catch {
        parsed = null;
      }
    }
  }
  if (!parsed || typeof parsed.topic !== 'string' || (parsed.topic as string).length < 10) {
    return { success: false, error: `Gagal parse ide. Raw: ${text.slice(0, 600)}` };
  }

  const idea = {
    topic: String(parsed.topic ?? '').slice(0, 500),
    platform: typeof parsed.platform === 'string' ? String(parsed.platform) : undefined,
    tone: typeof parsed.tone === 'string' ? String(parsed.tone) : undefined,
    language: typeof parsed.language === 'string' ? String(parsed.language) : undefined,
    targetCategory: typeof parsed.targetCategory === 'string' ? String(parsed.targetCategory) : undefined,
    audience: typeof parsed.audience === 'string' ? String(parsed.audience) : undefined,
    ctaStyle: typeof parsed.ctaStyle === 'string' ? String(parsed.ctaStyle) : undefined,
    purpose: typeof parsed.purpose === 'string' ? String(parsed.purpose) : undefined,
    constraints: typeof parsed.constraints === 'string' ? String(parsed.constraints) : undefined,
    keywords: typeof parsed.keywords === 'string' ? String(parsed.keywords) : undefined,
    targetLocation: typeof parsed.targetLocation === 'string' ? String(parsed.targetLocation) : undefined,
    secondaryLocation: typeof parsed.secondaryLocation === 'string' ? String(parsed.secondaryLocation) : undefined,
    audienceAge: typeof parsed.audienceAge === 'string' ? String(parsed.audienceAge) : undefined,
    audienceInterests: typeof parsed.audienceInterests === 'string' ? String(parsed.audienceInterests) : Array.isArray(parsed.audienceInterests) ? (parsed.audienceInterests as string[]).join(', ') : undefined,
    accountGoal: typeof parsed.accountGoal === 'string' ? String(parsed.accountGoal) : undefined,
    allowedCategories: typeof parsed.allowedCategories === 'string' ? String(parsed.allowedCategories) : Array.isArray(parsed.allowedCategories) ? (parsed.allowedCategories as string[]).join(', ') : undefined,
    excludedCategories: typeof parsed.excludedCategories === 'string' ? String(parsed.excludedCategories) : Array.isArray(parsed.excludedCategories) ? (parsed.excludedCategories as string[]).join(', ') : undefined
  };

  await incrementRateLimit(ip, 'generate_idea').catch(() => {});
  return { success: true, idea };
}

export interface ResearchAdminResult {
  success: boolean;
  error?: string;
}

async function assertAdmin(): Promise<SupabaseClient> {
  if (!(await isAdmin())) {
    throw new Error('forbidden');
  }
  return getServiceClient();
}

/**
 * Retry a failed (or stuck) research session: delete its old (possibly junk)
 * topics and reset it to `discovering` with a back-dated
 * `current_stage_started_at` so the cron picks it up within the guard window.
 * Only allows retry from `failed` or `awaiting_selection` to avoid
 * disrupting sessions that are actively in-flight.
 */
export async function retrySession(sessionId: string): Promise<ResearchAdminResult> {
  try {
    const supabase = await assertAdmin();
    // Delete old topics (they were produced by buggy code and are junk).
    await supabase
      .from('content_research_topics')
      .delete()
      .eq('session_id', sessionId);
    // Reset to discovering, back-date the timestamp past the cron guard.
    const { data, error } = await supabase
      .from('content_research_sessions')
      .update({
        status: 'discovering',
        error_message: null,
        current_stage_started_at: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', sessionId)
      .in('status', ['failed', 'awaiting_selection', 'completed'])
      .select('id')
      .maybeSingle();
    if (error) return { success: false, error: error.message };
    if (!data) return { success: false, error: 'session not in a retryable state (failed/awaiting/completed)' };
    await supabase.from('content_research_logs').insert({
      session_id: sessionId,
      stage: 'retry',
      level: 'info',
      message: 'admin triggered retry — topics cleared, status reset to discovering'
    });
    // Inline-run discovery so the admin sees progress sooner. Discovery can
    // take ~60-90s (Tavily + LLM); if this exceeds the server-action timeout,
    // the back-dated current_stage_started_at lets pg_cron re-pick. Errors
    // are surfaced but do not roll back the reset.
    try {
      const { advanceStage } = await import('@/lib/research/orchestrator'); await advanceStage(supabase, sessionId);
    } catch (e) {
      return { success: true, error: `retry started but inline run failed: ${e instanceof Error ? e.message : String(e)}` };
    }
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Resume a failed research session from the stage that failed, WITHOUT
 * discarding prior stage outputs (topics, scores, admin shortlist). Only the
 * failed stage is retried. Falls back to `developing` when the failed stage
 * cannot be determined from logs.
 *
 * Contrast with retrySession(): a full reset to `discovering` that deletes
 * all topics. Prefer resumeSession() for failures in verifying/scoring/
 * developing where upstream data is still valid; use retrySession() when the
 * failure is in `discovering` or upstream data is suspected junk.
 */
export async function resumeSession(sessionId: string): Promise<ResearchAdminResult> {
  try {
    const supabase = await assertAdmin();

    // Determine the failed stage from the most recent error log.
    const { data: errLog } = await supabase
      .from('content_research_logs')
      .select('stage')
      .eq('session_id', sessionId)
      .eq('level', 'error')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const guessed = (errLog as { stage: string } | null)?.stage ?? 'developing';

    // Resumable stages: every active stage except `pending` (pending has no
    // work yet — just wait for cron). `discovering` is resumable but requires
    // topic cleanup first since partial discovery produces junk.
    const resumable = ['discovering', 'verifying', 'scoring', 'awaiting_selection', 'developing'];
    const targetStage = resumable.includes(guessed) ? guessed : 'developing';

    // If the failure was in discovering, prior topics are likely junk —
    // delete them so discovery starts clean. For other stages, keep topics.
    if (targetStage === 'discovering') {
      await supabase
        .from('content_research_topics')
        .delete()
        .eq('session_id', sessionId);
    }

    const { data, error } = await supabase
      .from('content_research_sessions')
      .update({
        status: targetStage,
        error_message: null,
        current_stage_started_at: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', sessionId)
      .eq('status', 'failed')
      .select('id')
      .maybeSingle();
    if (error) return { success: false, error: error.message };
    if (!data) return { success: false, error: 'session not failed (resume only applies to failed sessions)' };

    await supabase.from('content_research_logs').insert({
      session_id: sessionId,
      stage: targetStage,
      level: 'info',
      message: `admin triggered resume — status reset to ${targetStage} (prior data preserved)`
    });

    // Inline-run the resumed stage so the admin sees progress within ~30-60s
    // instead of waiting up to 10 minutes for the pg_cron tick. The back-dated
    // current_stage_started_at lets cron re-pick if this inline call fails.
    try {
      const { advanceStage } = await import('@/lib/research/orchestrator'); await advanceStage(supabase, sessionId);
    } catch (e) {
      return { success: true, error: `resumed but inline run failed: ${e instanceof Error ? e.message : String(e)}` };
    }
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function shortlistTopics(
  sessionId: string,
  topicIds: string[]
): Promise<ResearchAdminResult> {
  try {
    const supabase = await assertAdmin();
    if (topicIds.length === 0) {
      return { success: false, error: 'no topics selected' };
    }
    const { error } = await supabase
      .from('content_research_topics')
      .update({ status: 'shortlisted' })
      .eq('session_id', sessionId)
      .in('id', topicIds);
    if (error) return { success: false, error: error.message };
    await supabase.from('content_research_logs').insert({
      session_id: sessionId,
      stage: 'awaiting_selection',
      level: 'info',
      message: `admin shortlisted ${topicIds.length} topic(s)`
    });
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function rejectTopics(
  sessionId: string,
  topicIds: string[]
): Promise<ResearchAdminResult> {
  try {
    const supabase = await assertAdmin();
    if (topicIds.length === 0) {
      return { success: false, error: 'no topics selected' };
    }
    const { error } = await supabase
      .from('content_research_topics')
      .update({ status: 'rejected' })
      .eq('session_id', sessionId)
      .in('id', topicIds);
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Move a research session from `awaiting_selection` to `developing` so the
 * next cron tick will run the development stage. Idempotent.
 */
export async function advanceToDevelopment(
  sessionId: string
): Promise<ResearchAdminResult> {
  try {
    const supabase = await assertAdmin();
    // Verify at least one shortlisted topic exists.
    const { count, error: countError } = await supabase
      .from('content_research_topics')
      .select('id', { count: 'exact', head: true })
      .eq('session_id', sessionId)
      .eq('status', 'shortlisted');
    if (countError) return { success: false, error: countError.message };
    if (!count || count === 0) {
      return { success: false, error: 'no shortlisted topics' };
    }
    // Conditional update so we don't accidentally advance a non-pending session.
    const { data, error } = await supabase
      .from('content_research_sessions')
      .update({
        status: 'developing',
        current_stage_started_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', sessionId)
      .eq('status', 'awaiting_selection')
      .select('id')
      .maybeSingle();
    if (error) return { success: false, error: error.message };
    if (!data) return { success: false, error: 'session not in awaiting_selection' };

    // Inline-run the development stage so the admin sees the draft within
    // ~30-60s instead of waiting up to 10 minutes for the pg_cron tick. The
    // cron stays as a safety net for stuck sessions; the back-dated
    // current_stage_started_at above already lets cron re-pick if this inline
    // call times out or throws. Errors here are surfaced but do not roll back
    // the transition — cron will retry.
    try {
      const { advanceStage } = await import('@/lib/research/orchestrator'); await advanceStage(supabase, sessionId);
    } catch (e) {
      return { success: true, error: `stage transitioned but inline run failed: ${e instanceof Error ? e.message : String(e)}` };
    }
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/* ------------------------------------------------------------------ */
/* Admin actions: affiliate swap / remove                             */
/* ------------------------------------------------------------------ */

export interface AffiliateAdminResult {
  success: boolean;
  error?: string;
  draftId?: string;
}

export async function swapAffiliateProduct(
  draftId: string,
  newProductId: string
): Promise<AffiliateAdminResult> {
  try {
    const supabase = await assertAdmin();
    const { data: product, error: prodError } = await supabase
      .from('affiliate_products')
      .select('id, friendly_code, name_id, name_en, category, merchant, url, image')
      .eq('id', newProductId)
      .maybeSingle();
    if (prodError || !product) {
      return { success: false, error: prodError?.message ?? 'product not found' };
    }
    const prod = product as { id: string; friendly_code: string; url: string; name_id: string; name_en: string; image: string; category: string; merchant: string };
    const { data: draft, error: draftError } = await supabase
      .from('content_drafts')
      .select('id, affiliate_injections, affiliate_swap_history')
      .eq('id', draftId)
      .maybeSingle();
    if (draftError || !draft) {
      return { success: false, error: draftError?.message ?? 'draft not found' };
    }
    // Compute a match signal against the draft's topic (best-effort scoring).
    let matchScore = 0;
    let matchSignals: {
      category_match: boolean;
      keyword_overlap: number;
      scored_from_pool_size: number;
    } = { category_match: false, keyword_overlap: 0, scored_from_pool_size: 0 };
    const { data: draftTopic } = await supabase
      .from('content_drafts')
      .select('research_topic_id')
      .eq('id', draftId)
      .maybeSingle();
    const researchTopicId = (draftTopic as { research_topic_id: string | null } | null)?.research_topic_id;
    if (researchTopicId) {
      const { data: rt } = await supabase
        .from('content_research_topics')
        .select('topic, category, key_facts, hooks')
        .eq('id', researchTopicId)
        .maybeSingle();
      if (rt) {
        const { selectAffiliateProduct } = await import('@/lib/research/affiliate');
        const result = await selectAffiliateProduct(supabase, {
          topic: (rt as { topic: string }).topic,
          category: (rt as { category: string | null }).category,
          key_facts: Array.isArray((rt as { key_facts: unknown }).key_facts)
            ? ((rt as { key_facts: string[] }).key_facts)
            : undefined,
          hooks: Array.isArray((rt as { hooks: unknown }).hooks)
            ? ((rt as { hooks: Array<{ type: string; text: string }> }).hooks)
            : undefined
        });
        if (result && result.product.id === prod.id) {
          matchScore = result.matchScore;
          matchSignals = result.signals;
        }
      }
    }
    const currentId = (draft.affiliate_injections as Array<{ id?: string }>)[0]?.id;
    const oldHistory = Array.isArray(draft.affiliate_swap_history)
      ? (draft.affiliate_swap_history as Array<unknown>)
      : [];
    const history = [
      ...oldHistory,
      {
        from_id: currentId ?? null,
        to_id: prod.id,
        to_friendly_code: prod.friendly_code,
        to_match_score: matchScore,
        swapped_at: new Date().toISOString()
      }
    ].slice(-10);
    const { error: updateError } = await supabase
      .from('content_drafts')
      .update({
        affiliate_injections: [
          {
            id: prod.id,
            friendly_code: prod.friendly_code,
            url: prod.url,
            post_index: 0,
            match_score: matchScore,
            match_signals: matchSignals,
            product_name_id: prod.name_id,
            product_name_en: prod.name_en,
            product_image: prod.image,
            product_category: prod.category,
            product_merchant: prod.merchant
          }
        ],
        affiliate_match_score: matchScore,
        affiliate_match_signals: matchSignals,
        affiliate_swap_history: history
      })
      .eq('id', draftId);
    if (updateError) return { success: false, error: updateError.message };
    return { success: true, draftId };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function removeAffiliateInjection(
  draftId: string
): Promise<AffiliateAdminResult> {
  try {
    const supabase = await assertAdmin();
    const { data: draft, error: draftError } = await supabase
      .from('content_drafts')
      .select('id, affiliate_injections, affiliate_swap_history')
      .eq('id', draftId)
      .maybeSingle();
    if (draftError || !draft) {
      return { success: false, error: draftError?.message ?? 'draft not found' };
    }
    const oldHistory = Array.isArray(draft.affiliate_swap_history)
      ? (draft.affiliate_swap_history as Array<unknown>)
      : [];
    const currentId = (draft.affiliate_injections as Array<{ id?: string }>)[0]?.id;
    const history = [
      ...oldHistory,
      {
        from_id: currentId ?? null,
        to_id: null,
        action: 'removed',
        swapped_at: new Date().toISOString()
      }
    ].slice(-10);
    const { error: updateError } = await supabase
      .from('content_drafts')
      .update({
        affiliate_injections: [],
        affiliate_match_score: null,
        affiliate_match_signals: null,
        affiliate_swap_history: history
      })
      .eq('id', draftId);
    if (updateError) return { success: false, error: updateError.message };
    return { success: true, draftId };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}
