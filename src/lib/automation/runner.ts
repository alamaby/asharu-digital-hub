import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { env } from '@/lib/env';
import { publishArticleDraftCore } from '@/lib/articles/publish';
import { loadAutomationConfig, resolveRecipients, resolveRunLocales, type AutomationConfig } from './config';
import { isRunDue, localDateString, pickRandomProduct } from './scheduler';
import {
  sendDraftReadyEmail,
  sendFailureEmail,
  sendPublishedEmail
} from './email';

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
}

export interface AutomationTickResult {
  ok: boolean;
  skipped?: 'disabled' | 'not_due' | 'already_done';
  runDate?: string;
  status?: AutomationRunStatus;
  advanced?: boolean;
  error?: string;
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

/** Draft per platform untuk sesi ini (terurut artikel → twitter → threads). */
async function loadDrafts(
  supabase: SupabaseClient,
  sessionId: string
): Promise<Array<{ id: string; platform: string | null }>> {
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
    .select('id, platform_slug')
    .in('research_topic_id', topicIds);
  const rows = ((data ?? []) as Array<{ id: string; platform_slug: string | null }>).map((r) => ({
    id: r.id,
    platform: r.platform_slug
  }));
  return rows.sort(
    (a, b) => PLATFORM_ORDER.indexOf(a.platform ?? '') - PLATFORM_ORDER.indexOf(b.platform ?? '')
  );
}

/** Buat sesi riset `dua` + produk tetap, lalu `automation_runs` untuk hari ini. */
async function createRun(
  supabase: SupabaseClient,
  cfg: AutomationConfig,
  runDate: string
): Promise<AutomationRunRow | { error: string }> {
  let poolQuery = supabase
    .from('affiliate_products')
    .select('id')
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(cfg.productPoolSize);
  if (cfg.productCategory) poolQuery = poolQuery.eq('category', cfg.productCategory);
  const { data: pool, error: poolError } = await poolQuery;
  if (poolError) return { error: `pool produk: ${poolError.message}` };
  const chosen = pickRandomProduct((pool ?? []) as { id: string }[]);
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
      maximum_iterations: 1,
      created_by: null
    })
    .select('id')
    .single();
  if (sessionError || !session) {
    return { error: `insert sesi: ${sessionError?.message ?? 'no id'}` };
  }
  const sessionId = (session as { id: string }).id;

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
  await log(supabase, sessionId, 'automation', 'info', `run ${runDate} dibuat untuk produk ${chosen.id}`);
  return run as AutomationRunRow;
}

/**
 * Jalankan satu tick automation. Idempoten: aman dipanggil tiap 5 menit.
 * `now`/`startMinutes` opsional untuk test; `force` (tombol admin "Run now")
 * mengabaikan jendela jadwal agar uji coba bisa kapan saja.
 */
export async function runAutomationTick(
  supabase: SupabaseClient,
  opts: { now?: Date; startMinutes?: number; force?: boolean } = {}
): Promise<AutomationTickResult> {
  const now = opts.now ?? new Date();
  const cfg = await loadAutomationConfig(supabase);
  if (!cfg) return { ok: true, skipped: 'disabled', error: 'config automation belum ada' };
  if (!cfg.isEnabled) return { ok: true, skipped: 'disabled' };

  const runDate = localDateString(now, cfg.timezone);

  const { data: existing } = await supabase
    .from('automation_runs')
    .select('*')
    .eq('run_date', runDate)
    .maybeSingle();
  let run = existing as AutomationRunRow | null;

  // Belum ada run hari ini → cek jendela jadwal lalu buat.
  if (!run) {
    if (!opts.force && !isRunDue(cfg, now, opts.startMinutes)) {
      return { ok: true, skipped: 'not_due', runDate };
    }
    const created = await createRun(supabase, cfg, runDate);
    if ('error' in created) return { ok: false, error: created.error, runDate };
    run = created;
    await supabase
      .from('automation_configs')
      .update({ last_run_at: now.toISOString() })
      .eq('id', 1);
  }

  // Sudah selesai / menunggu retry manual.
  if (run.status === 'completed') return { ok: true, skipped: 'already_done', runDate, status: run.status };
  if (run.status === 'failed') {
    if (run.attempts >= cfg.maxRetryAttempts) {
      return { ok: true, skipped: 'already_done', runDate, status: run.status };
    }
    // Sesi riset failed tidak bisa pulih dari sisi automation (butuh
    // perbaikan di halaman riset) — jangan retry berulang tanpa guna.
    if (run.session_id) {
      const sessionStatus = await loadSessionStatus(supabase, run.session_id);
      if (sessionStatus === 'failed') {
        return { ok: true, skipped: 'already_done', runDate, status: run.status };
      }
    }
    // Reset cover_started_at: tanpa ini, batas tunggu cover dihitung dari
    // timestamp run pertama sehingga retry langsung timeout lagi.
    await updateRun(supabase, run.id, {
      status: run.session_id ? 'developing' : 'session_created',
      attempts: run.attempts + 1,
      error_message: null,
      cover_started_at: null
    });
    run = {
      ...run,
      status: run.session_id ? 'developing' : 'session_created',
      attempts: run.attempts + 1,
      cover_started_at: null
    };
  }

  const advanced = await advanceRun(supabase, cfg, run);
  return { ok: true, runDate, status: advanced.status, advanced: advanced.changed };
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
        } else {
          await updateRun(supabase, run.id, { draft_ready_notified_at: new Date().toISOString() });
        }
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
        }
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
      status: 'completed',
      notified_at: new Date().toISOString()
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
  cfg: AutomationConfig,
  run: AutomationRunRow,
  stage: string,
  error: string
): Promise<void> {
  // Best-effort penuh: ini dipanggil dari jalur kegagalan, jadi ia tidak boleh
  // menambah kegagalan baru (run sudah/akan ditandai failed oleh pemanggil).
  try {
    const recipients = await resolveRecipients(supabase, cfg);
    const res = await sendFailureEmail(supabase, cfg, {
      recipients,
      runDate: run.run_date,
      stage,
      error,
      siteUrl: env.siteUrl
    });
    if (!res.ok && !res.skipped) {
      await log(supabase, run.session_id, 'automation', 'warn', `email failure gagal: ${res.error}`);
    }
  } catch (e) {
    await log(
      supabase,
      run.session_id,
      'automation',
      'warn',
      `notifikasi failure error: ${e instanceof Error ? e.message : String(e)}`
    );
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
