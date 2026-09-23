import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { env } from '@/lib/env';
import { ARTICLE_MIN_WORDS } from '@/lib/llm/prompt';
import { publishArticleDraftCore } from '@/lib/articles/publish';
import { loadAutomationConfig, resolveRecipients, resolveRunLocales, type AutomationConfig } from './config';
import { defaultIdeaDeps, generateSessionIdea, type GeneratedIdea, type IdeaProduct } from '@/lib/research/idea';
import { getResearchTemplateHint } from '@/lib/research/templates';
import { isRunDue, localDateString, pickRandomProduct, blackoutCutoff } from './scheduler';
import { loadEnabledSlots, mergeSlotParams, isSlotDue } from './schedules';
import { sendDraftReadyEmail, sendPublishedEmail, logAutomationEmail } from './email';
import { reportError } from '@/lib/notifications/error-events';

export type AutomationRunStatus =
  | 'session_created'
  | 'developing'
  | 'awaiting_cover'
  | 'publishing'
  | 'published'
  | 'notifying'
  | 'completed'
  | 'failed';

const PLATFORM_ORDER = ['artikel', 'twitter', 'threads'];

interface AutomationRunRow {
  id: string;
  run_date: string;
  status: AutomationRunStatus;
  product_id: string | null;
  session_id: string | null;
  article_draft_id: string | null;
  article_ids: string[] | null;
  cover_attempts: number;
  cover_started_at: string | null;
  draft_ready_notified_at: string | null;
  published_at: string | null;
  notified_at: string | null;
  attempts: number;
  error_message: string | null;
  /** Ditambahkan Fase 2; pre-migrasi bernilai undefined (koersi ke null saat log). */
  slot_key?: string | null;
}

export interface AutomationTickResult {
  ok: boolean;
  skipped?: 'disabled' | 'not_due' | 'already_done';
  runDate?: string;
  status?: AutomationRunStatus;
  advanced?: boolean;
  error?: string;
  /** Slot-level detail (Fase 2). Isi dari slot pertama yang berubah untuk kompatibilitas renderTickMessage. */
  slots?: Array<{ slot_key: string; status: AutomationRunStatus; advanced: boolean }>;
}

async function log(
  supabase: SupabaseClient,
  sessionId: string | null,
  stage: string,
  level: 'info' | 'warn' | 'error',
  message: string
): Promise<void> {
  if (!sessionId) return;
  try {
    await supabase
      .from('content_research_logs')
      .insert({ session_id: sessionId, stage, level, message: message.slice(0, 800) });
  } catch {
    /* audit best-effort — jangan pernah menggagalkan tick */
  }
}

async function updateRun(
  supabase: SupabaseClient,
  runId: string,
  patch: Partial<AutomationRunRow> & Record<string, unknown>
): Promise<void> {
  await supabase
    .from('automation_runs')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', runId);
}

/** True bila config `notify_on` mencakup momen tsb. */
function wantsNotification(cfg: AutomationConfig, moment: 'draft_ready' | 'published'): boolean {
  if (cfg.notifyOn === 'none') return false;
  if (cfg.notifyOn === 'both') return true;
  return cfg.notifyOn === moment;
}

async function loadSessionStatus(
  supabase: SupabaseClient,
  sessionId: string
): Promise<string | null> {
  const { data } = await supabase
    .from('content_research_sessions')
    .select('status')
    .eq('id', sessionId)
    .maybeSingle();
  return (data as { status: string } | null)?.status ?? null;
}
/** Detail produk untuk ideation + label email. Tidak pernah melempar. */
async function loadProductDetail(
  supabase: SupabaseClient,
  productId: string | null
): Promise<{ label: string; detail: IdeaProduct | null }> {
  if (!productId) return { label: '(produk)', detail: null };
  try {
    const { data } = await supabase
      .from('affiliate_products')
      .select('id, friendly_code, name_id, name_en, category, merchant, url')
      .eq('id', productId)
      .maybeSingle();
    const row = data as {
      id: string;
      friendly_code: string | null;
      name_id: string | null;
      name_en: string | null;
      category: string | null;
      merchant: string | null;
      url: string | null;
    } | null;
    if (!row?.name_id) return { label: '(produk)', detail: null };
    return {
      label: row.name_id ?? row.friendly_code ?? '(produk)',
      detail: {
        id: row.id,
        friendly_code: row.friendly_code,
        name_id: row.name_id,
        name_en: row.name_en,
        category: row.category,
        merchant: row.merchant,
        url: row.url
      }
    };
  } catch {
    return { label: '(produk)', detail: null };
  }
}

/** Produk name untuk email (fallback friendly_code). Tidak pernah melempar. */
async function productLabel(supabase: SupabaseClient, productId: string | null): Promise<string> {

  if (!productId) return '(produk)';
  try {
    const { data } = await supabase
      .from('affiliate_products')
      .select('name_id, friendly_code')
      .eq('id', productId)
      .maybeSingle();
    const row = data as { name_id: string | null; friendly_code: string | null } | null;
    return row?.name_id ?? row?.friendly_code ?? '(produk)';
  } catch {
    return '(produk)';
  }
}

interface SessionDraft {
  id: string;
  platform: string | null;
  /** True bila `llm_meta.thin_content` (gate publish pasti menolak). */
  thinContent: boolean;
  /** Ringkasan `llm_meta.word_count` untuk pesan error, mis. `id:505`. */
  words: string;
}

/** Draft per platform untuk sesi ini (terurut artikel → twitter → threads). */
async function loadDrafts(
  supabase: SupabaseClient,
  sessionId: string
): Promise<SessionDraft[]> {
  // Dua langkah (topik → draf), pola sama dengan research/development.ts —
  // menghindari filter embedded PostgREST yang rapuh.
  const { data: topics } = await supabase
    .from('content_research_topics')
    .select('id')
    .eq('session_id', sessionId);
  const topicIds = ((topics ?? []) as { id: string }[]).map((t) => t.id);
  if (topicIds.length === 0) return [];
  const { data } = await supabase
    .from('content_drafts')
    .select('id, platform_slug, llm_meta')
    .in('research_topic_id', topicIds);
  const rows = (
    (data ?? []) as Array<{
      id: string;
      platform_slug: string | null;
      llm_meta: { thin_content?: unknown; word_count?: unknown } | null;
    }>
  ).map((r) => {
    const meta = r.llm_meta ?? {};
    const wc = (meta.word_count ?? {}) as Record<string, unknown>;
    return {
      id: r.id,
      platform: r.platform_slug,
      thinContent: meta.thin_content === true,
      words: Object.entries(wc)
        .map(([l, w]) => `${l}:${w}`)
        .join(', ')
    };
  });
  return rows.sort(
    (a, b) => PLATFORM_ORDER.indexOf(a.platform ?? '') - PLATFORM_ORDER.indexOf(b.platform ?? '')
  );
}

/** Tahap ideation di createRun: riset mekanisme produk → generate ide.
 * Fail-soft total: kembalikan null bila knob mati / tahap mana pun gagal —
 * pemanggil memakai nilai config mentah (perilaku lama). Log best-effort
 * agar operator bisa menelusuri provenance ide di halaman riset.
 */
async function enrichSessionIdea(
  supabase: SupabaseClient,
  cfg: AutomationConfig,
  sessionId: string,
  productId: string
): Promise<GeneratedIdea | null> {
  if (!cfg.ideaGenerationEnabled) return null;
  try {
    const { detail } = await loadProductDetail(supabase, productId);
    if (!detail) return null;
    const deps = await defaultIdeaDeps(supabase);
    if (!deps) return null;
    if (!cfg.ideaProductSearch) deps.searchProvider = null;
    let templateHint: string | null = null;
    try {
      const tpl = await getResearchTemplateHint(supabase, cfg.templateSlug);
      if (tpl) templateHint = `${tpl.display_name} — ${tpl.description}`;
    } catch {
      templateHint = null;
    }
    const idea = await generateSessionIdea(
      supabase,
      detail,
      {
        language: cfg.language,
        tone: cfg.tone,
        audience: cfg.audience,
        purpose: cfg.purpose,
        ctaStyle: cfg.ctaStyle,
        templateSlug: cfg.templateSlug,
        targetReplyCount: cfg.targetReplyCount
      },
      templateHint,
      deps
    );
    if (idea) {
      await log(supabase, sessionId, 'automation', 'info', `ideation: ide "${idea.topic.slice(0, 120)}" dari mekanisme produk`);
    } else {
      await log(supabase, sessionId, 'automation', 'warn', 'ideation gagal/invalid — lanjut parameter config mentah');
    }
    return idea;
  } catch {
    return null;
  }
}
/** Buat sesi riset `dua` + produk tetap, lalu `automation_runs` untuk hari ini + slot tertentu. */
async function createRun(
  supabase: SupabaseClient,
  cfg: AutomationConfig,
  runDate: string,
  slotKey: string
): Promise<AutomationRunRow | { error: string }> {
  // Dedup produk: exclude product_id yang sudah dipakai run lain hari itu.
  // Pool kecil ≤500 jadi aman filter di-memory.
  let poolQuery = supabase
    .from('affiliate_products')
    .select('id')
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(cfg.productPoolSize);
  if (cfg.productCategory) poolQuery = poolQuery.eq('category', cfg.productCategory);
  const { data: pool, error: poolError } = await poolQuery;
  if (poolError) return { error: `pool produk: ${poolError.message}` };
  const poolRows = (pool ?? []) as { id: string }[];
  if (poolRows.length === 0) return { error: 'tidak ada produk afiliasi aktif untuk dipilih' };

  // Ambil produk yang sudah dipakai run lain hari ini (bukan slot ini).
  const { data: occupied } = await supabase
    .from('automation_runs')
    .select('product_id')
    .eq('run_date', runDate)
    .neq('slot_key', slotKey);
  const occupiedIds = ((occupied ?? []) as { product_id: string | null }[])
    .map((r) => r.product_id)
    .filter(Boolean) as string[];

  // Blackout global: produk yang dipakai run manapun dalam N hari terakhir
  // tidak dipilih ulang. Q global (semua slot) mencegah repeat lintas-slot
  // dan lintas-hari sesui knob. Bila query gagal / days=0 → kosong (=tanpa ekslusi).
  const blackoutDays = Math.max(0, Math.min(90, cfg.productBlackoutDays ?? 14));
  let blackoutIds: string[] = [];
  if (blackoutDays > 0) {
    const cutoff = blackoutCutoff(runDate, blackoutDays);
    const { data: recent } = await supabase
      .from('automation_runs')
      .select('product_id')
      .gte('run_date', cutoff);
    blackoutIds = ((recent ?? []) as { product_id: string | null }[])
      .map((r) => r.product_id)
      .filter(Boolean) as string[];
  }

  const occupiedSet = new Set(occupiedIds);
  const blackoutSet = new Set(blackoutIds);
  const l1 = poolRows.filter((p) => !occupiedSet.has(p.id) && !blackoutSet.has(p.id));
  const l2 = poolRows.filter((p) => !occupiedSet.has(p.id));
  const fallbackLevel = l1.length > 0 ? 0 : l2.length > 0 ? 1 : 2;
  const effective = l1.length > 0 ? l1 : l2.length > 0 ? l2 : poolRows;
  const chosen = pickRandomProduct(effective.length > 0 ? effective : poolRows);
  if (!chosen) return { error: 'tidak ada produk afiliasi aktif untuk dipilih' };

  const { data: session, error: sessionError } = await supabase
    .from('content_research_sessions')
    .insert({
      status: 'pending',
      mechanism: cfg.mechanism,
      topic: null,
      language: cfg.language,
      tone: cfg.tone,
      audience: cfg.audience,
      audience_age: cfg.audience,
      purpose: cfg.purpose,
      account_goal: cfg.purpose,
      cta_style: cfg.ctaStyle,
      platform_slug: null,
      platform_slugs: cfg.platformSlugs,
      template_slug: cfg.templateSlug,
      target_reply_count: cfg.targetReplyCount,
      required_winners: cfg.maxTopics,
      /** Knob discovery: pakai cfg.maxIterations (Fase 3), fallback 1 bila belum di-migrate. */
      maximum_iterations: cfg.maxIterations ?? 1,
      created_by: null
    })
    .select('id')
    .single();
  if (sessionError || !session) {
    return { error: `insert sesi: ${sessionError?.message ?? 'no id'}` };
  }
  const sessionId = (session as { id: string }).id;

  // Tahap ideation (fail-soft): hasil valid ditulis ke sesi agar discovery
  // menerima parameter lebih lengkap; gagal → perilaku lama (config mentah).
  const idea = await enrichSessionIdea(supabase, cfg, sessionId, chosen.id);
  if (idea) {
    await supabase
      .from('content_research_sessions')
      .update({
        topic: idea.topic,
        keywords: idea.keywords,
        target_category: idea.targetCategory,
        audience: idea.audience ?? cfg.audience,
        audience_age: idea.audience ?? cfg.audience,
        audience_interests: idea.audienceInterests ?? [],
        target_location: idea.targetLocation,
        account_goal: idea.accountGoal ?? cfg.purpose,
        purpose: idea.purpose ?? cfg.purpose,
        tone: idea.tone ?? cfg.tone,
        cta_style: idea.ctaStyle ?? cfg.ctaStyle,
        updated_at: new Date().toISOString()
      } as unknown as Record<string, unknown>)
      .eq('id', sessionId);
  }

  const { error: productError } = await supabase
    .from('content_research_session_products')
    .insert({ session_id: sessionId, product_id: chosen.id, position: 0 });
  if (productError) {
    await supabase
      .from('content_research_sessions')
      .update({ status: 'failed', error_message: `automation: ${productError.message}` })
      .eq('id', sessionId);
    return { error: `insert produk tetap: ${productError.message}` };
  }

  const { data: run, error: runError } = await supabase
    .from('automation_runs')
    .insert({
      run_date: runDate,
      slot_key: slotKey,
      status: 'session_created',
      config_snapshot: cfg as unknown as Record<string, unknown>,
      product_id: chosen.id,
      session_id: sessionId
    })
    .select('*')
    .single();
  if (runError || !run) {
    // Balapan dua tick (keduanya melihat "belum ada run") → yang kalah
    // menerima unique violation. Buang sesi ekstra (cascade menghapus
    // session_products) dan pakai run milik pemenang; bila bukan karena
    // duplikat, tandai sesi failed agar tidak jadi orphan yang dipungut
    // cron riset tanpa pengelola.
    const { data: winner } = await supabase
      .from('automation_runs')
      .select('*')
      .eq('run_date', runDate)
      .eq('slot_key', slotKey)
      .maybeSingle();
    if (winner) {
      await supabase.from('content_research_sessions').delete().eq('id', sessionId);
      return winner as AutomationRunRow;
    }
    await supabase
      .from('content_research_sessions')
      .update({
        status: 'failed',
        error_message: `automation: ${runError?.message ?? 'insert run returned no id'}`,
        updated_at: new Date().toISOString()
      })
      .eq('id', sessionId);
    return { error: `insert run: ${runError?.message ?? 'no id'}` };
  }
  await log(supabase, sessionId, 'automation', 'info', `run ${runDate} slot=${slotKey} dibuat untuk produk ${chosen.id} (pool=${poolRows.length} occupied=${occupiedIds.length} blackout=${blackoutIds.length} fallback=${fallbackLevel})`);
  return run as AutomationRunRow;
}

/**
 * Jalankan satu tick automation. Idempoten: aman dipanggil tiap 5 menit.
 * `now`/`startMinutes` opsional untuk test; `force` (tombol admin "Run now")
 * mengabaikan jendela jadwal agar uji coba bisa kapan saja.
 * `slotKey` opsional: bila diisi hanya proses slot itu; bila kosong proses semua slot enabled.
 */
export async function runAutomationTick(
  supabase: SupabaseClient,
  opts: { now?: Date; startMinutes?: number; force?: boolean; slotKey?: string } = {}
): Promise<AutomationTickResult> {
  const now = opts.now ?? new Date();
  const cfg = await loadAutomationConfig(supabase);
  if (!cfg) return { ok: true, skipped: 'disabled', error: 'config automation belum ada' };
  if (!cfg.isEnabled) return { ok: true, skipped: 'disabled' };

  const runDate = localDateString(now, cfg.timezone);

  // Muat slot-enabled dari DB. Bila tabel belum ada (pre-migrasi), fallback
  // ke 1 slot virtual agar perilaku existing tak berubah diam-diam.
  let slots = await loadEnabledSlots(supabase);
  if (slots.length === 0) {
    // Virtual slot `default` meniru singleton lama.
    slots = [{
      id: 'virtual',
      slot_key: 'default',
      label: 'Jadwal utama (fallback)',
      hour: cfg.scheduleHour,
      minute: cfg.scheduleMinute,
      weekdays: 127,
      is_enabled: true,
      window_minutes: null,
      priority: 0,
      platform_slugs: null,
      max_topics: null,
      product_pool_size: null,
      product_category: null,
      auto_publish_article: null,
      require_cover: null,
      notify_on: null,
      notify_emails: null,
      maximum_iterations: null,
      minimum_score: null,
      minimum_candidates: null,
      freshness_hours: null,
      cover_max_wait_minutes: null,
      cover_max_attempts: null,
      max_retry_attempts: null,
      language: null,
      tone: null,
      audience: null,
      purpose: null,
      cta_style: null,
      target_reply_count: null,
      template_slug: null,
      idea_generation_enabled: null,
      idea_product_search: null,
      email_from: null,
      email_reply_to: null,
      product_repeat_blackout_days: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }];
  }

  // Filter slot berdasarkan force slotKey bila diminta.
  const targetSlots = opts.slotKey
    ? slots.filter((s) => s.slot_key === opts.slotKey && s.is_enabled)
    : slots.filter((s) => s.is_enabled);

  // Muat SEMUA run hari ini untuk dedup & advance multiplex.
  const { data: allRunsData } = await supabase
    .from('automation_runs')
    .select('*')
    .eq('run_date', runDate)
    .order('slot_key', { ascending: true });
  // Fallback: bila mock/client mengembalikan bukan array, coba maybeSingle.
  const rawAll = allRunsData as unknown[] | null;
  const allRuns = Array.isArray(rawAll) ? rawAll : rawAll ? [rawAll] : [];
  const existingRuns = (allRuns as AutomationRunRow[]).reduce<Record<string, AutomationRunRow>>((acc, r) => {
    const key = (r.slot_key ?? 'default') as string;
    acc[key] = r;
    return acc;
  }, {} as Record<string, AutomationRunRow>);

  const created: Array<{ slot_key: string; run: AutomationRunRow }> = [];
  for (const slot of targetSlots) {
    const due = opts.force || isSlotDue(slot, cfg, now, opts.startMinutes);
    if (!due) continue;
    if (!existingRuns[slot.slot_key]) {
      const merged = mergeSlotParams(cfg, slot);
      const createdRun = await createRun(supabase, merged, runDate, slot.slot_key);
      if ('error' in createdRun) {
        // Gagal membuat salah satu slot → lanjut slot lain (best-effort).
        await log(supabase, null, 'automation', 'warn', `slot ${slot.slot_key} gagal: ${createdRun.error}`);
        continue;
      }
      created.push({ slot_key: slot.slot_key, run: createdRun });
    }
  }
  // Catat last_run_at bila setidaknya 1 run berhasil dibuat hari ini.
  if (created.length > 0) {
    await supabase
      .from('automation_configs')
      .update({ last_run_at: now.toISOString() })
      .eq('id', 1);
  }

  // Advance SEMUA run terbuka hari itu (bukan hanya 1).
  const openStatuses = new Set<AutomationRunStatus>([
    'session_created', 'developing', 'awaiting_cover', 'publishing', 'published', 'notifying'
  ]);
  const results: Array<{ slot_key: string; status: AutomationRunStatus; advanced: boolean }> = [];
  let hadOpenRun = false;
  for (const run of Object.values(existingRuns)) {
    if (openStatuses.has(run.status)) {
      hadOpenRun = true;
      const sk = (run.slot_key ?? 'default') as string;
      const advanced = await advanceRun(supabase, cfg, run);
      // advanceRun modifies run in place via updateRun → ambil status terbaru.
      results.push({ slot_key: sk, status: run.status, advanced: advanced.changed });
    } else if (run.status === 'completed') {
      // Terminal: lewati, keputusan already_done di akhir (multi-slot).
      continue;
    } else if (run.status === 'failed') {
      // Retry: reset ke tahap aman sebelum advanceRun memprosesnya lagi.
      if (run.attempts < cfg.maxRetryAttempts) {
        const sessionStatus = await loadSessionStatus(supabase, run.session_id ?? '');
        if (sessionStatus !== 'failed') {
          await updateRun(supabase, run.id, {
            status: run.session_id ? 'developing' : 'session_created',
            attempts: run.attempts + 1,
            error_message: null,
            cover_started_at: null
          });
          run.status = run.session_id ? 'developing' : 'session_created';
          run.attempts = run.attempts + 1;
          run.cover_started_at = null;
          hadOpenRun = true;
          const sk = (run.slot_key ?? 'default') as string;
          const advanced = await advanceRun(supabase, cfg, run);
          results.push({ slot_key: sk, status: run.status, advanced: advanced.changed });
          continue;
        }
      }
      // Attempts habis atau sesi failed → terminal (lewati).
      continue;
    }
  }
  // Tambahkan hasil dari run yang baru dibuat (belum masuk existingRuns).
  for (const c of created) {
    const advanced = await advanceRun(supabase, cfg, c.run);
    results.push({ slot_key: c.slot_key, status: c.run.status, advanced: advanced.changed });
  }

  // Semua run hari ini terminal (completed/failed), tidak ada yang dibuka → sudah selesai hari ini.
  // HARUS dicek SEBELUM cabang force-error di bawah: force + sudah-terminal = already_done (idempoten, perilaku pre-e3ade31).
  if (!hadOpenRun && results.length === 0 && created.length === 0) {
    const terminalRuns = Object.values(existingRuns).filter(
      (r) => r.status === 'completed' || r.status === 'failed'
    );
    if (terminalRuns.length > 0) {
      terminalRuns.sort((a, b) => ((a.slot_key ?? 'default') as string).localeCompare(b.slot_key ?? 'default'));
      return { ok: true, skipped: 'already_done', runDate, status: (terminalRuns[0] as AutomationRunRow)?.status ?? 'completed' };
    }
  }

  // Bila force tapi semua slot gagal membuat run → kembalikan error (backward-compat).
  // Hanya tercapai bila tidak ada terminalRuns (sudah ditangani di atas).
  if (!hadOpenRun && results.length === 0 && opts.force) {
    return { ok: false, error: 'semua slot gagal membuat run hari ini', runDate };
  }

  // Check not_due bila tidak ada run & force bukan mode.
  if (!hadOpenRun && results.length === 0 && !opts.force) {
    const firstDue = targetSlots.some((s) => isSlotDue(s, cfg, now, opts.startMinutes));
    if (!firstDue) return { ok: true, skipped: 'not_due', runDate };
  }

  const last = results[results.length - 1];
  return { ok: true, runDate, status: last?.status, advanced: last?.advanced ?? false, slots: results };
}

/**
 * State machine run: mengamati status sesi riset yang digerakkan cron riset,
 * lalu shortlist → develop → tunggu cover → publish → email.
 */
async function advanceRun(
  supabase: SupabaseClient,
  cfg: AutomationConfig,
  run: AutomationRunRow
): Promise<{ status: AutomationRunStatus; changed: boolean }> {
  const sessionId = run.session_id;
  if (!sessionId) {
    await updateRun(supabase, run.id, {
      status: 'failed',
      error_message: 'run tanpa session_id'
    });
    return { status: 'failed', changed: true };
  }
  const status = await loadSessionStatus(supabase, sessionId);

  if (status === 'failed') {
    await updateRun(supabase, run.id, { status: 'failed', error_message: 'sesi riset failed' });
    await notifyFailure(supabase, cfg, run, 'developing', 'Sesi riset berstatus failed.');
    return { status: 'failed', changed: true };
  }

  // 1) Sesi menunggu seleksi: shortlist top-N + majukan ke developing.
  if (status === 'awaiting_selection') {
    const { data: topics } = await supabase
      .from('content_research_topics')
      .select('id, rank')
      .eq('session_id', sessionId)
      .order('rank', { ascending: true, nullsFirst: false })
      .limit(cfg.maxTopics);
    const ids = ((topics ?? []) as { id: string }[]).map((t) => t.id);
    if (ids.length === 0) {
      await updateRun(supabase, run.id, {
        status: 'failed',
        error_message: 'discovery tidak menghasilkan topik'
      });
      await notifyFailure(supabase, cfg, run, 'awaiting_selection', 'Discovery 0 topik.');
      return { status: 'failed', changed: true };
    }
    await supabase
      .from('content_research_topics')
      .update({ status: 'shortlisted' })
      .eq('session_id', sessionId)
      .in('id', ids);
    // Backdate agar cron riset (guard 5 mnt) langsung memungut tick berikutnya.
    const { data: moved } = await supabase
      .from('content_research_sessions')
      .update({
        status: 'developing',
        current_stage_started_at: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', sessionId)
      .eq('status', 'awaiting_selection')
      .select('id')
      .maybeSingle();
    if (!moved) return { status: run.status, changed: false };
    await log(supabase, sessionId, 'automation', 'info', `shortlist ${ids.length} topik → developing`);
    await updateRun(supabase, run.id, { status: 'developing' });
    return { status: 'developing', changed: true };
  }

  // 2) Masih tahap awal/berjalan: tunggu cron riset.
  if (status === 'pending' || status === 'discovering' || status === 'verifying' || status === 'scoring') {
    if (run.status !== 'developing') await updateRun(supabase, run.id, { status: 'developing' });
    return { status: 'developing', changed: false };
  }

  // 3) Sesi completed → draf siap.
  if (status === 'completed' && run.status === 'session_created') {
    await updateRun(supabase, run.id, { status: 'developing' });
    return { status: 'developing', changed: true };
  }
  if (status === 'completed' && run.status === 'developing') {
    const drafts = await loadDrafts(supabase, sessionId);
    const articleDraft = drafts.find((d) => d.platform === 'artikel');
    if (!articleDraft) {
      await updateRun(supabase, run.id, {
        status: 'failed',
        error_message: 'draf artikel tidak ditemukan setelah development'
      });
      await notifyFailure(supabase, cfg, run, 'developing', 'Draf artikel tidak ditemukan.');
      return { status: 'failed', changed: true };
    }
    // Gate thin-content lebih awal (kasus 87b9fdc1): draf tipis deterministik
    // ditolak gate publish — jangan bakar render cover + 3x publish yang sia-sia.
    // `article_draft_id` tetap disimpan agar retry admin lanjut dari cover
    // setelah draf dikembangkan manual di /konten/review.
    if (articleDraft.thinContent) {
      const msg =
        `draf artikel thin content (${articleDraft.words || '?'} kata, minimum ${ARTICLE_MIN_WORDS}) — ` +
        `kembangkan di /konten/review/${articleDraft.id} lalu publish manual atau retry run`;
      await updateRun(supabase, run.id, {
        status: 'failed',
        error_message: msg,
        article_draft_id: articleDraft.id
      });
      await log(supabase, sessionId, 'automation', 'error', msg);
      await notifyFailure(supabase, cfg, run, 'developing', msg);
      return { status: 'failed', changed: true };
    }
    // Email "draft siap" (best-effort, sebelum publish). Kegagalan apa pun
    // di sini tidak boleh mencegah alur lanjut ke cover/publish.
    if (wantsNotification(cfg, 'draft_ready') && !run.draft_ready_notified_at) {
      try {
        const recipients = await resolveRecipients(supabase, cfg);
        const res = await sendDraftReadyEmail(supabase, cfg, {
          recipients,
          runDate: run.run_date,
          productName: await productLabel(supabase, run.product_id),
          drafts: drafts.map((d) => ({ platform: d.platform ?? '?', draftId: d.id })),
          siteUrl: env.siteUrl
        });
        if (!res.ok && !res.skipped) {
          await log(supabase, sessionId, 'automation', 'warn', `email draft_ready gagal: ${res.error}`);
        } else if (res.ok) {
          await updateRun(supabase, run.id, { draft_ready_notified_at: new Date().toISOString() });
        }
        // Log selalu ditulis (termasuk skipped) agar badge UI menampilkan alasan.
        void logAutomationEmail(supabase, {
          runId: run.id,
          runDate: run.run_date,
          slotKey: run.slot_key ?? null,
          moment: 'draft_ready',
          recipients,
          result: res
        });
      } catch (e) {
        await log(
          supabase,
          sessionId,
          'automation',
          'warn',
          `notifikasi draft_ready error: ${e instanceof Error ? e.message : String(e)}`
        );
      }
    }
    const next: AutomationRunStatus = cfg.requireCover ? 'awaiting_cover' : 'publishing';
    await updateRun(supabase, run.id, {
      status: next,
      article_draft_id: articleDraft.id,
      ...(cfg.requireCover ? { cover_started_at: new Date().toISOString() } : {})
    });
    await log(supabase, sessionId, 'automation', 'info', `draf siap (${drafts.length}) → ${next}`);
    return { status: next, changed: true };
  }

  // 4) Menunggu cover ter-render.
  if (run.status === 'awaiting_cover') {
    if (!cfg.requireCover) {
      await updateRun(supabase, run.id, { status: 'publishing' });
      return { status: 'publishing', changed: true };
    }
    const outcome = await ensureCover(supabase, cfg, run);
    if (outcome === 'ready') {
      await updateRun(supabase, run.id, { status: 'publishing' });
      await log(supabase, sessionId, 'automation', 'info', 'cover ter-render → publishing');
      return { status: 'publishing', changed: true };
    }
    if (outcome === 'failed') return { status: 'failed', changed: true };
    return { status: 'awaiting_cover', changed: false };
  }

  // 5) Publish artikel.
  if (run.status === 'publishing') {
    if (!run.article_draft_id) {
      await updateRun(supabase, run.id, { status: 'failed', error_message: 'article_draft_id kosong' });
      return { status: 'failed', changed: true };
    }
    if (!cfg.autoPublishArticle) {
      await updateRun(supabase, run.id, { status: 'completed' });
      await log(supabase, sessionId, 'automation', 'info', 'auto_publish_article=false → selesai tanpa publish');
      return { status: 'completed', changed: true };
    }
    const result = await publishArticleDraftCore(
      supabase,
      run.article_draft_id,
      resolveRunLocales(cfg.language)
    );
    if (!result.success) {
      await updateRun(supabase, run.id, { status: 'failed', error_message: result.error ?? 'publish gagal' });
      await notifyFailure(supabase, cfg, run, 'publishing', result.error ?? 'publish gagal');
      return { status: 'failed', changed: true };
    }
    const articles = result.published ?? [];
    await updateRun(supabase, run.id, {
      status: 'published',
      article_ids: articles.map((a) => a.id),
      published_at: new Date().toISOString()
    });
    await log(
      supabase,
      sessionId,
      'automation',
      'info',
      `artikel published: ${articles.map((a) => `${a.locale}/${a.slug}`).join(', ')}`
    );
    return { status: 'published', changed: true };
  }

    // 6) Notifikasi published → selesai.
    if (run.status === 'published') {
      // Seluruh langkah notifikasi dibungkus try/catch: kegagalan (query data,
      // render, pengiriman) harus membuat run tetap maju ke `completed` —
      // status artikel sudah benar-benar published di titik ini.
      if (wantsNotification(cfg, 'published') && !run.notified_at) {
        try {
          const recipients = await resolveRecipients(supabase, cfg);
          const articles = await loadArticleLinks(supabase, run.article_ids ?? []);
          const res = await sendPublishedEmail(supabase, cfg, {
            recipients,
            runDate: run.run_date,
            productName: await productLabel(supabase, run.product_id),
            articles,
            siteUrl: env.siteUrl
          });
          if (!res.ok && !res.skipped) {
            await log(supabase, sessionId, 'automation', 'warn', `email published gagal: ${res.error}`);
          } else if (res.ok) {
            // JUJUR: notified_at HANYA saat email benar-benar terkirim.
            await updateRun(supabase, run.id, { notified_at: new Date().toISOString() });
          } else {
            await log(supabase, sessionId, 'automation', 'warn', `email published dilewati: ${res.error}`);
          }
          // Log selalu ditulis (termasuk skipped) agar badge UI menampilkan alasan.
          void logAutomationEmail(supabase, {
            runId: run.id,
            runDate: run.run_date,
            slotKey: run.slot_key ?? null,
            moment: 'published',
            recipients,
            result: res
          });
        } catch (e) {
          await log(
            supabase,
            sessionId,
            'automation',
            'warn',
            `notifikasi published error: ${e instanceof Error ? e.message : String(e)}`
          );
        }
      }
      await updateRun(supabase, run.id, {
        status: 'completed'
      });
      return { status: 'completed', changed: true };
    }

  return { status: run.status, changed: false };
}

async function loadArticleLinks(
  supabase: SupabaseClient,
  articleIds: string[]
): Promise<Array<{ locale: string; slug: string }>> {
  if (articleIds.length === 0) return [];
  const { data } = await supabase.from('articles').select('locale, slug').in('id', articleIds);
  return (data ?? []) as Array<{ locale: string; slug: string }>;
}

async function notifyFailure(
  supabase: SupabaseClient,
  _cfg: AutomationConfig,
  run: AutomationRunRow,
  stage: string,
  error: string
): Promise<void> {
  // Queue-only: email dikirim via digest (lihat /api/notifications/error-digest).
  // Failure email langsung dimigrasikan ke queue 2026-09-22 agar satu email
  // rangkuman per jendela, bukan spam per kejadian.
  void _cfg;
  try {
    await reportError(supabase, {
      category: 'automation', source: 'notifyFailure', severity: 'error',
      stage, message: error,
      details: { run_date: run.run_date, slot_key: run.slot_key ?? null },
      sessionId: run.session_id, runId: run.id
    });
  } catch {
    await log(supabase, run.session_id, 'automation', 'warn',
      `queue error event gagal: ${error.slice(0, 200)}`);
  }
}

/**
 * Pastikan cover draf artikel benar-benar ter-render (`selected`).
 * - belum ada baris post 0 → insert pending (lane reasoning)
 * - `prompt_ready` → set pending (prompt terisi → lane generate, worker render)
 * - `pending` → tunggu worker
 * - `failed` → re-queue selama attempts < cover_max_attempts
 * Kembalikan 'ready' | 'waiting' | 'failed'.
 */
async function ensureCover(
  supabase: SupabaseClient,
  cfg: AutomationConfig,
  run: AutomationRunRow
): Promise<'ready' | 'waiting' | 'failed'> {
  if (!run.article_draft_id) {
    return failCover(supabase, cfg, run, 'article_draft_id kosong saat menunggu cover');
  }
  // cover_started_at wajib tersimpan: bila hanya di-default ke `now` tanpa
  // di-persist, batas tunggu ter-reset tiap tick dan tidak pernah tercapai
  // (retry manual / run lama sebelum kolom ini terisi).
  let startedAt = run.cover_started_at;
  if (!startedAt) {
    startedAt = new Date().toISOString();
    await updateRun(supabase, run.id, { cover_started_at: startedAt });
  }
  const waitMs = cfg.coverMaxWaitMinutes * 60 * 1000;
  const timedOut = Date.now() - new Date(startedAt).getTime() > waitMs;

  const { data: rows } = await supabase
    .from('content_draft_images')
    .select('id, status, attempts, last_error')
    .eq('draft_id', run.article_draft_id)
    .eq('post_index', 0)
    .order('created_at', { ascending: false });
  const row = (rows ?? [])[0] as
    | { id: string; status: string; attempts: number; last_error: string | null }
    | undefined;

  if (!row) {
    if (timedOut) return failCover(supabase, cfg, run, 'cover belum diantrekan dalam batas waktu');
    await supabase.from('content_draft_images').insert({
      draft_id: run.article_draft_id,
      post_index: 0,
      image_prompt: '',
      provider_slug: '',
      model_id: ''
    });
    return 'waiting';
  }

  if (row.status === 'selected') return 'ready';

  if (row.status === 'prompt_ready') {
    // Prompt sudah dibuat reasoning; ubah ke pending agar lane generate
    // merender gambar sungguhan (bukan hanya menyiapkan prompt).
    await supabase
      .from('content_draft_images')
      .update({ status: 'pending', updated_at: new Date().toISOString() })
      .eq('id', row.id);
    return 'waiting';
  }

  if (row.status === 'failed') {
    if (run.cover_attempts >= cfg.coverMaxAttempts) {
      return failCover(supabase, cfg, run, `cover gagal ${run.cover_attempts}x: ${row.last_error ?? 'unknown'}`);
    }
    if (timedOut) return failCover(supabase, cfg, run, 'cover melewati batas waktu');
    await supabase
      .from('content_draft_images')
      .update({ status: 'pending', attempts: 0, last_error: null, updated_at: new Date().toISOString() })
      .eq('id', row.id);
    await updateRun(supabase, run.id, { cover_attempts: run.cover_attempts + 1 });
    return 'waiting';
  }

  // pending / ready (belum selected) → masih diproses worker.
  if (timedOut) return failCover(supabase, cfg, run, 'cover melewati batas waktu');
  return 'waiting';
}

async function failCover(
  supabase: SupabaseClient,
  cfg: AutomationConfig,
  run: AutomationRunRow,
  message: string
): Promise<'failed'> {
  await updateRun(supabase, run.id, { status: 'failed', error_message: message });
  await log(supabase, run.session_id, 'automation', 'error', `cover gate: ${message}`);
  await notifyFailure(supabase, cfg, run, 'awaiting_cover', message);
  return 'failed';
}
