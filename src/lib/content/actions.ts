'use server';

import { z } from 'zod';
import { headers } from 'next/headers';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { checkRateLimit, getClientIp, incrementRateLimit } from './rate-limit';
import { isAdmin } from '@/lib/auth/is-admin';
import { extractUrls } from '@/lib/utils/urls';

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
  // Per-stage provider→model overrides (admin only, optional UUIDs)
  ideaGenerationModelId: z.string().uuid().optional(),
  discoveringModelId: z.string().uuid().optional(),
  verifyingModelId: z.string().uuid().optional(),
  scoringModelId: z.string().uuid().optional(),
  developingModelId: z.string().uuid().optional(),
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
  for (const k of ['ideaGenerationModelId', 'discoveringModelId', 'verifyingModelId', 'scoringModelId', 'developingModelId']) {
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

  // Validate per-stage model overrides: must be active and exist (admin-only feature)
  const isAdminUser = await isAdmin();
  const stageModelIds: Record<string, string | null> = {
    idea_generation_model_id: null,
    discovering_model_id: null,
    verifying_model_id: null,
    scoring_model_id: null,
    developing_model_id: null
  };
  const modelFieldMap: Record<string, keyof typeof parsed.data> = {
    idea_generation_model_id: 'ideaGenerationModelId',
    discovering_model_id: 'discoveringModelId',
    verifying_model_id: 'verifyingModelId',
    scoring_model_id: 'scoringModelId',
    developing_model_id: 'developingModelId'
  };
  for (const [col, field] of Object.entries(modelFieldMap)) {
    const uuid = (parsed.data as unknown as Record<string, string | undefined>)[field as string];
    if (!uuid) continue;
    if (!isAdminUser) {
      return { success: false, error: 'Pemilihan model hanya untuk admin' };
    }
    const { data: m } = await supabase.from('llm_models').select('id, is_active, provider_id').eq('id', uuid).maybeSingle();
    const model = m as { id: string; is_active: boolean; provider_id: string } | null;
    if (!model || !model.is_active) {
      return { success: false, fieldErrors: { [field as string]: 'Model tidak valid atau nonaktif' }, error: 'validation' };
    }
    stageModelIds[col] = model.id;
  }

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
      idea_generation_model_id: stageModelIds.idea_generation_model_id,
      discovering_model_id: stageModelIds.discovering_model_id,
      verifying_model_id: stageModelIds.verifying_model_id,
      scoring_model_id: stageModelIds.scoring_model_id,
      developing_model_id: stageModelIds.developing_model_id,
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
  // Honeypot (P1-07) — before rate limit / LLM
  if (raw.website && raw.website.trim() !== '') {
    return { success: false, error: 'honeypot' };
  }
  const hdrs = await headers();
  const ip = getClientIp(hdrs);
  const { allowed, count } = await checkRateLimit(ip, 'generate_idea', 30);
  if (!allowed) {
    return { success: false, error: `rate_limit:${count}` };
  }

  const pick = (v: unknown): string | null => {
    const s = typeof v === 'string' ? v.trim() : '';
    return s ? s : null;
  };
  const platformHint = pick(raw.platform) ?? 'all';
  const toneHint = pick(raw.tone);
  const languageHint = pick(raw.language) ?? 'both';
  const topicHint = pick(raw.topic);
  const targetCategoryHint = pick(raw.targetCategory);
  const audienceHint = pick(raw.audience);
  const ctaHint = pick(raw.ctaStyle);
  const purposeHint = pick(raw.purpose);
  const constraintsHint = pick(raw.constraints);
  const keywordsHint = pick(raw.keywords);
  const targetLocationHint = pick(raw.targetLocation);
  const secondaryLocationHint = pick(raw.secondaryLocation);
  const audienceAgeHint = pick(raw.audienceAge);
  const audienceInterestsHint = pick(raw.audienceInterests);
  const accountGoalHint = pick(raw.accountGoal);
  const allowedCategoriesHint = pick(raw.allowedCategories);
  const excludedCategoriesHint = pick(raw.excludedCategories);
  const pastedUrls = extractUrls(`${raw.topic ?? ''} ${raw.keywords ?? ''} ${raw.purpose ?? ''}`);

  // Variety seed: tiap klik harus menghasilkan ide BERBEDA meski hint sama.
  const varietySeed = `${Date.now().toString(36)}-${Math.floor(Math.random() * 0xffffff).toString(16)}`;

  // Jika user paste link di topik/keywords/purpose, telusuri isinya via
  // Tavily extract agar LLM menganalisa halaman tersebut (best-effort).
  let pastedContext: string | null = null;
  if (pastedUrls.length > 0) {
    try {
      const supabaseService = getServiceClient();
      const { getSearchProvider } = await import('@/lib/research/search');
      const searchProvider = await getSearchProvider(supabaseService);
      const pages = await searchProvider.extract(pastedUrls.slice(0, 2), {
        query: topicHint ?? keywordsHint ?? undefined
      });
      const usable = pages.filter((p) => p.content.trim().length > 100);
      if (usable.length > 0) {
        pastedContext = usable
          .map((p, i) => `[Halaman ${i + 1}] ${p.title}\n${p.url}\n${p.content.slice(0, 3000)}`)
          .join('\n\n');
      }
    } catch {
      pastedContext = null;
    }
  }

  // Build prompt — lightweight idea generator
  const system = `Anda adalah Content Idea Generator untuk Asharu (asharu.id). Tugas: buat 1 ide konten afiliasi yang segar, spesifik, dan siap isi form.
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
Aturan: topic harus 10-500 char, spesifik (hindari pola generik "tips X terbaik"); JANGAN mengulang ide umum yang sudah sering dipakai — variasikan sudut, audiens, dan kategori. Hormati hint user yang sudah diisi (jangan ubah maknanya, pertajam). Bahasa output ${languageHint}.`;
  const hintLines = [
    `platform=${platformHint}`,
    toneHint ? `tone=${toneHint}` : null,
    `language=${languageHint}`,
    topicHint ? `topik existing (JANGAN ulangi, buat sudut BERBEDA)=${topicHint}` : null,
    targetCategoryHint ? `targetCategory=${targetCategoryHint}` : null,
    audienceHint ? `audience=${audienceHint}` : null,
    ctaHint ? `ctaStyle=${ctaHint}` : null,
    purposeHint ? `purpose=${purposeHint}` : null,
    constraintsHint ? `constraints=${constraintsHint}` : null,
    keywordsHint ? `keywords=${keywordsHint}` : null,
    targetLocationHint ? `targetLocation=${targetLocationHint}` : `targetLocation=Indonesia`,
    secondaryLocationHint ? `secondaryLocation=${secondaryLocationHint}` : null,
    audienceAgeHint ? `audienceAge=${audienceAgeHint}` : null,
    audienceInterestsHint ? `audienceInterests=${audienceInterestsHint}` : null,
    accountGoalHint ? `accountGoal=${accountGoalHint}` : null,
    allowedCategoriesHint ? `allowedCategories=${allowedCategoriesHint}` : null,
    excludedCategoriesHint ? `excludedCategories=${excludedCategoriesHint}` : null,
    pastedUrls.length > 0 ? `pastedUrls=${pastedUrls.join(', ')}` : null
  ].filter((l): l is string => Boolean(l));
  const user = `Hint user:\n${hintLines.map((l) => `- ${l}`).join('\n')}${
    pastedContext
      ? `\n\nKonten link yang dipaste user (ANALISA halaman ini dan buat topik dari isinya — jangan mengarang di luar isi berikut):\n${pastedContext}`
      : pastedUrls.length > 0
        ? `\n\nCatatan: user mempaste link (${pastedUrls.join(', ')}) tapi isinya tidak bisa diambil — buat topik dari konteks URL/teks yang ada sebisanya.`
        : ''
  }\nVariasi #${varietySeed} — berikan 1 ide yang segar dan BERBEDA dari pola umum. Pastikan semua field terisi natural, jangan kosongkan topic/audience/purpose. Keywords relevan dengan topic.`;

  // Use service client for LLM pool (bypasses RLS)
  const supabaseService = getServiceClient();
  const { runLLMCompletion } = await import('@/lib/llm/completion');
  // Idea generation model: session-agnostic, use stage default if set
  let ideaModel: { providerId: string | null; modelUuid: string | null } = { providerId: null, modelUuid: null };
  try {
    const { resolveStageModel } = await import('@/lib/llm/stage-defaults');
    ideaModel = await resolveStageModel('idea_generation', null);
  } catch { void 0; /* fallback to global */ }
  // If admin passed pinned model via FormData, prefer it — admin only (P0-04)
  const ideaModelHint = pick(raw.ideaGenerationModelId);
  if (ideaModelHint) {
    if (!(await isAdmin())) {
      return { success: false, error: 'Pemilihan model hanya untuk admin' };
    }
    const { data: m } = await supabaseService.from('llm_models').select('id, provider_id, is_active').eq('id', ideaModelHint).eq('is_active', true).maybeSingle();
    const mr = m as { id: string; provider_id: string; is_active: boolean } | null;
    if (!mr) return { success: false, error: 'Model tidak valid atau nonaktif' };
    ideaModel = { providerId: mr.provider_id, modelUuid: mr.id };
  }
  let text = '';
  try {
    const result = await runLLMCompletion(supabaseService, {
      requestId: null,
      stage: 'idea_generation',
      providerId: ideaModel.providerId,
      modelUuid: ideaModel.modelUuid,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user }
      ],
      temperature: 1.0,
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

export async function regenerateAffiliateInsertion(
  draftId: string,
  newProductId: string,
  opts?: { modelId?: string }
): Promise<AffiliateAdminResult> {
  try {
    const supabase = await assertAdmin();
    const hdrs = await headers();
    const ip = getClientIp(hdrs);
    const { allowed, count } = await checkRateLimit(ip, 'regen_affiliate', 20);
    if (!allowed) return { success: false, error: `rate_limit:${count}` };

    const { data: product, error: prodError } = await supabase
      .from('affiliate_products')
      .select('id, friendly_code, name_id, name_en, category, merchant, url, image')
      .eq('id', newProductId)
      .maybeSingle();
    if (prodError || !product) return { success: false, error: prodError?.message ?? 'product not found' };
    const prod = product as { id: string; friendly_code: string; url: string; name_id: string; name_en: string; image: string; category: string; merchant: string };

    const { data: draft, error: draftError } = await supabase
      .from('content_drafts')
      .select('id, generated_thread, affiliate_injections, affiliate_swap_history, research_topic_id, request_id, affiliate_match_score')
      .eq('id', draftId)
      .maybeSingle();
    if (draftError || !draft) return { success: false, error: draftError?.message ?? 'draft not found' };
    const d = draft as {
      id: string;
      generated_thread: { main: { id: string; en: string }; replies: { id: string; en: string }[] };
      affiliate_injections: Array<{ id?: string; friendly_code: string; url: string; post_index: number }>;
      affiliate_swap_history: unknown;
      research_topic_id: string | null;
      request_id: string | null;
    };
    const thread = d.generated_thread as { main: { id: string; en: string }; replies: { id: string; en: string }[] };
    if (!thread || !thread.main || !Array.isArray(thread.replies)) {
      return { success: false, error: 'invalid thread shape' };
    }

    // Resolve sessionId + topic context correctly (P0-1 fix)
    let resolvedSessionId: string | null = null;
    let topicText = prod.name_id;
    let language: string = 'both';
    let tone: string | null = null;
    let maxChars: number | null = null;
    if (d.research_topic_id) {
      const { data: rt } = await supabase
        .from('content_research_topics')
        .select('topic, session_id')
        .eq('id', d.research_topic_id)
        .maybeSingle();
      if (rt) {
        topicText = (rt as { topic: string }).topic;
        resolvedSessionId = (rt as { session_id: string | null }).session_id ?? null;
      }
      if (resolvedSessionId) {
        const { data: sess } = await supabase
          .from('content_research_sessions')
          .select('language, tone, platform_slug')
          .eq('id', resolvedSessionId)
          .maybeSingle();
        if (sess) {
          language = (sess as { language: string | null }).language ?? language;
          tone = (sess as { tone: string | null }).tone ?? null;
          const slug = (sess as { platform_slug: string | null }).platform_slug ?? 'all';
          if (slug === 'all') {
            const { data: minRow } = await supabase
              .from('platforms')
              .select('max_chars')
              .eq('is_active', true)
              .not('max_chars', 'is', null)
              .order('max_chars', { ascending: true })
              .limit(1)
              .maybeSingle();
            maxChars = (minRow as { max_chars: number | null } | null)?.max_chars ?? 280;
          } else {
            const { data: prow } = await supabase.from('platforms').select('max_chars').eq('slug', slug).maybeSingle();
            maxChars = (prow as { max_chars: number | null } | null)?.max_chars ?? null;
          }
        }
      }
    } else if (d.request_id) {
      // Legacy content_requests draft: request_id may be research session id
      resolvedSessionId = d.request_id;
      const { data: sess2 } = await supabase
        .from('content_research_sessions')
        .select('language, tone, platform_slug')
        .eq('id', resolvedSessionId)
        .maybeSingle();
      if (sess2) {
        language = (sess2 as { language: string | null }).language ?? language;
        tone = (sess2 as { tone: string | null }).tone ?? null;
        const slug = (sess2 as { platform_slug: string | null }).platform_slug ?? 'all';
        if (slug === 'all') {
          const { data: minRow } = await supabase
            .from('platforms')
            .select('max_chars')
            .eq('is_active', true)
            .not('max_chars', 'is', null)
            .order('max_chars', { ascending: true })
            .limit(1)
            .maybeSingle();
          maxChars = (minRow as { max_chars: number | null } | null)?.max_chars ?? 280;
        } else {
          const { data: prow } = await supabase.from('platforms').select('max_chars').eq('slug', slug).maybeSingle();
          maxChars = (prow as { max_chars: number | null } | null)?.max_chars ?? null;
        }
      }
    }

    const currentInj = (d.affiliate_injections as Array<{ post_index?: number }>)[0];
    // Clamp to valid range: 0 = main, 1..n = replies. Fallback to middle if missing.
    const rawTarget = typeof currentInj?.post_index === 'number' ? currentInj.post_index : Math.floor(thread.replies.length / 2) + 1;
    const boundedTarget = Math.max(0, Math.min(rawTarget, thread.replies.length));

    const { buildSingleReplyRewritePrompt } = await import('@/lib/llm/prompt');
    const { runLLMCompletion } = await import('@/lib/llm/completion');
    const { replacePlaceholders, sanitizeThreadText } = await import('@/lib/research/thread');

    // Resolve regen model: opts.modelId > session fallback > stage default > global
    let regenModel: { providerId: string | null; modelUuid: string | null } = { providerId: null, modelUuid: null };
    const pinnedModelId = opts?.modelId?.trim() || null;
    if (pinnedModelId) {
      const { data: m } = await supabase.from('llm_models').select('id, provider_id, is_active').eq('id', pinnedModelId).eq('is_active', true).maybeSingle();
      const mr = m as { id: string; provider_id: string; is_active: boolean } | null;
      if (!mr) return { success: false, error: 'Model tidak valid atau nonaktif' };
      regenModel = { providerId: mr.provider_id, modelUuid: mr.id };
    } else {
      try {
        const { resolveStageModel } = await import('@/lib/llm/stage-defaults');
        // Per-session regen not stored; use global default
        regenModel = await resolveStageModel('regen_affiliate', null);
      } catch { void 0; }
    }

    const promptProduct = { friendlyCode: prod.friendly_code, name: prod.name_id, url: prod.url, category: prod.category };
    const { system, user } = buildSingleReplyRewritePrompt(
      { topic: topicText, language, tone, targetIndex: boundedTarget, threadJson: thread, maxChars },
      promptProduct
    );

    const llmResult = await runLLMCompletion(supabase, {
      requestId: null,
      sessionId: resolvedSessionId,
      stage: 'regen_affiliate',
      providerId: regenModel.providerId,
      modelUuid: regenModel.modelUuid,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user }
      ],
      temperature: 0.7,
      maxTokens: 600
    });

    const raw = llmResult.output.text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    let rewritten: { id: string; en: string } | null = null;
    try {
      const parsed = JSON.parse(raw) as { id?: string; en?: string };
      if (typeof parsed.id === 'string' && typeof parsed.en === 'string' && parsed.id.trim() && parsed.en.trim()) {
        rewritten = { id: parsed.id.trim(), en: parsed.en.trim() };
      }
    } catch {
      const m = raw.match(/\{[\s\S]*\}/);
      if (m) {
        try {
          const parsed2 = JSON.parse(m[0]) as { id?: string; en?: string };
          if (typeof parsed2.id === 'string' && typeof parsed2.en === 'string' && parsed2.id.trim() && parsed2.en.trim()) {
            rewritten = { id: parsed2.id.trim(), en: parsed2.en.trim() };
          }
        } catch { /* fallback below */ }
      }
    }
    if (!rewritten) {
      return { success: false, error: `LLM rewrite parse failed. Raw: ${llmResult.output.text.slice(0, 400)}` };
    }

    // P0-3: sanitize CJK + preserve LLM bridging text
    rewritten = { id: sanitizeThreadText(rewritten.id), en: sanitizeThreadText(rewritten.en) };

    const PLACEHOLDER = '{{PRODUCT_URL}}';
    // Preserve field: detect which field LLM used; if none, inject into primary field (id)
    const hasPlaceholderId = rewritten.id.includes(PLACEHOLDER);
    const hasPlaceholderEn = rewritten.en.includes(PLACEHOLDER);
    if (!hasPlaceholderId && !hasPlaceholderEn) {
      rewritten = { ...rewritten, id: `${rewritten.id} ${PLACEHOLDER}`.trim() };
    }

    const newThread: { main: { id: string; en: string }; replies: { id: string; en: string }[] } = {
      main: { ...thread.main },
      replies: thread.replies.map((r) => ({ ...r }))
    };
    if (boundedTarget === 0) newThread.main = rewritten;
    else newThread.replies[boundedTarget - 1] = rewritten;

    // P1-1: enforce exactly 1 placeholder preserving target field; strip others
    const allTexts = [newThread.main.id, newThread.main.en, ...newThread.replies.flatMap((r) => [r.id, r.en])].join(' ');
    const placeholderCount = (allTexts.match(/\{\{PRODUCT_URL\}\}/g) ?? []).length;
    if (placeholderCount !== 1) {
      let kept = false;
      const keepFirst = (s: string) => s.replace(/\{\{PRODUCT_URL\}\}/g, () => (kept ? '' : (kept = true, '{{PRODUCT_URL}}')));
      const removeAll = (s: string) => s.split(PLACEHOLDER).join('').replace(/\s{2,}/g, ' ').trim();
      if (boundedTarget === 0) {
        // Ensure target (main) keeps placeholder
        if (!newThread.main.id.includes(PLACEHOLDER) && !newThread.main.en.includes(PLACEHOLDER)) {
          newThread.main.id = `${newThread.main.id} ${PLACEHOLDER}`.trim();
        }
        newThread.main.id = keepFirst(newThread.main.id);
        newThread.main.en = keepFirst(newThread.main.en);
        newThread.replies = newThread.replies.map((r) => ({ id: removeAll(r.id), en: removeAll(r.en) }));
      } else {
        const tr = newThread.replies[boundedTarget - 1]!;
        if (!tr.id.includes(PLACEHOLDER) && !tr.en.includes(PLACEHOLDER)) tr.id = `${tr.id} ${PLACEHOLDER}`.trim();
        // Keep exactly one in target, remove all elsewhere
        newThread.main.id = removeAll(newThread.main.id);
        newThread.main.en = removeAll(newThread.main.en);
        newThread.replies = newThread.replies.map((r, i) => {
          if (i === boundedTarget - 1) return { id: keepFirst(r.id), en: keepFirst(r.en) };
          return { id: removeAll(r.id), en: removeAll(r.en) };
        });
      }
    }

    const replaced = replacePlaceholders(newThread as unknown as { main: { id: string; en: string }; replies: { id: string; en: string }[] } & Record<string, unknown>, prod.url) as unknown as { main: { id: string; en: string }; replies: { id: string; en: string }[] };

    let matchScore = 0;
    let matchSignals: Record<string, unknown> = { category_match: false, keyword_overlap: 0, scored_from_pool_size: 0, fallback_random: true };
    if (d.research_topic_id) {
      const { data: rt } = await supabase.from('content_research_topics').select('topic, category, key_facts, hooks').eq('id', d.research_topic_id).maybeSingle();
      if (rt) {
        const { selectAffiliateProduct } = await import('@/lib/research/affiliate');
        const scored = await selectAffiliateProduct(supabase, {
          topic: (rt as { topic: string }).topic,
          category: (rt as { category: string | null }).category,
          key_facts: Array.isArray((rt as { key_facts: unknown }).key_facts) ? ((rt as { key_facts: string[] }).key_facts) : undefined,
          hooks: Array.isArray((rt as { hooks: unknown }).hooks) ? ((rt as { hooks: Array<{ type: string; text: string }> }).hooks) : undefined
        });
        if (scored && scored.product.id === prod.id) {
          matchScore = scored.matchScore;
          matchSignals = scored.signals as unknown as Record<string, unknown>;
        }
      }
    }

    const currentId = (d.affiliate_injections as Array<{ id?: string }>)[0]?.id;
    const oldHistory = Array.isArray(d.affiliate_swap_history) ? (d.affiliate_swap_history as Array<unknown>) : [];
    const history = [
      ...oldHistory,
      { from_id: currentId ?? null, to_id: prod.id, to_friendly_code: prod.friendly_code, to_match_score: matchScore, swapped_at: new Date().toISOString(), regen: true, target_index: boundedTarget }
    ].slice(-10);

    const { data: providerRow } = await supabase.from('llm_providers').select('id').eq('slug', llmResult.providerSlug).maybeSingle();
    const providerId = (providerRow as { id: string } | null)?.id ?? null;

    const { error: updateError } = await supabase
      .from('content_drafts')
      .update({
        generated_thread: replaced as unknown as Record<string, unknown>,
        affiliate_injections: [
          { id: prod.id, friendly_code: prod.friendly_code, url: prod.url, post_index: boundedTarget, match_score: matchScore, match_signals: matchSignals, product_name_id: prod.name_id, product_name_en: prod.name_en, product_image: prod.image, product_category: prod.category, product_merchant: prod.merchant }
        ],
        affiliate_match_score: matchScore,
        affiliate_match_signals: matchSignals,
        affiliate_swap_history: history,
        provider_id: providerId,
        model_id: llmResult.model,
        last_regen_model_id: regenModel.modelUuid,
        llm_meta: { provider: llmResult.providerSlug, model: llmResult.model, latency_ms: llmResult.latencyMs, key_hash: llmResult.keyHash, stage: 'regen_affiliate', target_index: boundedTarget, fallback: (llmResult as { fallback?: boolean }).fallback ?? false }
      } as unknown as Record<string, unknown>)
      .eq('id', draftId);
    if (updateError) return { success: false, error: updateError.message };

    await incrementRateLimit(ip, 'regen_affiliate').catch(() => undefined);
    const didFallback = Boolean((llmResult as { fallback?: boolean }).fallback);
    // P0-2: use resolved session id for log; skip if null to avoid FK violation
    if (resolvedSessionId) {
      await supabase.from('content_research_logs').insert({
        session_id: resolvedSessionId,
        stage: 'regen_affiliate',
        level: didFallback ? 'warn' : 'info',
        message: `regen_affiliate draft ${draftId} -> ${prod.friendly_code} target ${boundedTarget} (${llmResult.providerSlug}/${llmResult.model})${didFallback ? ' [fallback ke global]' : ''}`
      } as unknown as Record<string, unknown>).then(() => undefined, () => undefined);
    }

    return { success: true, draftId };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}
