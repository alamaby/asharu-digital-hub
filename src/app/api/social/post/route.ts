import { NextRequest, NextResponse } from 'next/server';
import { isCronAuthorized } from '@/lib/content/cron-auth';
import { createSupabaseService } from '@/lib/supabase/server';
import {
  extractThreadTexts,
  resolveAccount,
  type GeneratedThread,
  type SocialAccount,
  type SocialPostConfig
} from '@/lib/social/config';
import {
  fetchPublishingLimit,
  publishThreadChain,
  refreshLongLivedToken
} from '@/lib/social/threads';

export const maxDuration = 300;

const MAX_ATTEMPTS = 5;

interface QueueItem {
  id: string;
  draft_id: string;
  platform_slug: string;
  account_id: string | null;
  lang: 'id' | 'en';
  status: string;
  attempts: number;
}

function isRetryable(message: string): boolean {
  return /429|rate|timeout|5\d\d|fetch failed|network/i.test(message);
}

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

  const { data: configRow } = await supabase
    .from('social_post_configs')
    .select('*')
    .eq('platform_slug', 'threads')
    .maybeSingle();
  const config = configRow as unknown as SocialPostConfig | null;
  if (!config || !config.is_enabled) {
    return NextResponse.json({ skipped: 'social posting disabled (social_post_configs.is_enabled)' });
  }

  const { data: accountRows } = await supabase.from('social_accounts').select('*');
  const account = resolveAccount(
    config,
    ((accountRows ?? []) as unknown as SocialAccount[]),
    null
  );
  if (!account) {
    return NextResponse.json({ error: 'no active social account' }, { status: 500 });
  }
  if (account.token_expires_at && new Date(account.token_expires_at).getTime() < Date.now()) {
    await supabase.from('social_accounts').update({ status: 'token_expired' }).eq('id', account.id);
    return NextResponse.json({ error: 'threads token expired — re-run seed-threads-token' }, { status: 500 });
  }
  if (!account.threads_user_id) {
    return NextResponse.json({ error: 'threads_user_id not set — finish Fase 0 OAuth' }, { status: 500 });
  }

  const { data: tokenData, error: tokenError } = await supabase.rpc(
    'vault_decrypt_secret_by_name',
    { p_name: account.vault_secret_name }
  );
  let token = (tokenError ? null : (tokenData as string | null));
  if (!token) {
    return NextResponse.json({ error: 'threads token not in Vault — run seed-threads-token' }, { status: 500 });
  }

  // Opportunistic refresh: token < H-7 → refresh → Vault baru → update row.
  // Gagal refresh tidak menggagalkan posting (token lama masih valid).
  const expiresAt = account.token_expires_at ? new Date(account.token_expires_at).getTime() : 0;
  if (expiresAt && expiresAt - Date.now() < 7 * 24 * 60 * 60_000) {
    try {
      const fresh = await refreshLongLivedToken(fetch, { token });
      const { data: newVaultId } = await supabase.rpc('vault_create_secret', {
        p_secret: fresh,
        p_name: account.vault_secret_name
      });
      if (newVaultId) {
        token = fresh;
        await supabase
          .from('social_accounts')
          .update({
            token_suffix: fresh.slice(-4),
            token_expires_at: new Date(Date.now() + 60 * 24 * 60 * 60_000).toISOString(),
            status: 'active'
          })
          .eq('id', account.id);
      }
    } catch {
      // Best-effort: lanjut dengan token lama.
    }
  }

  // Daily cap guard (configurable, default 25 < 250 kuota Meta).
  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  const { count: postedToday } = await supabase
    .from('social_post_queue')
    .select('id', { count: 'exact', head: true })
    .eq('platform_slug', 'threads')
    .eq('status', 'posted')
    .gte('posted_at', dayStart.toISOString());
  if ((postedToday ?? 0) >= config.daily_cap) {
    return NextResponse.json({ skipped: `daily cap reached (${config.daily_cap})` });
  }

  // Quota pre-check (best-effort, tidak fatal bila API tak merespons).
  const { quotaUsage } = await fetchPublishingLimit(fetch, {
    threadsUserId: account.threads_user_id,
    token
  }).catch(() => ({ quotaUsage: null as number | null }));
  if (quotaUsage !== null && quotaUsage >= 250) {
    return NextResponse.json({ error: 'threads publishing quota exhausted (250/24h)' }, { status: 429 });
  }

  // Klaim 1 antrean jatuh tempo (idempoten, race-safe via status guard).
  const { data: due } = await supabase
    .from('social_post_queue')
    .select('id, draft_id, platform_slug, account_id, lang, status, attempts')
    .eq('platform_slug', 'threads')
    .eq('status', 'queued')
    .lte('scheduled_at', new Date().toISOString())
    .order('scheduled_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  const item = due as unknown as QueueItem | null;
  if (!item) return NextResponse.json({ idle: true });

  if (item.attempts >= MAX_ATTEMPTS) {
    await supabase
      .from('social_post_queue')
      .update({ status: 'failed', last_error: `max attempts (${MAX_ATTEMPTS})` })
      .eq('id', item.id);
    return NextResponse.json({ error: 'max attempts', queueId: item.id }, { status: 500 });
  }

  const { error: claimError } = await supabase
    .from('social_post_queue')
    .update({ status: 'posting', attempts: item.attempts + 1 })
    .eq('id', item.id)
    .eq('status', 'queued');
  if (claimError) return NextResponse.json({ idle: true, raced: true });

  const { data: draft } = await supabase
    .from('content_drafts')
    .select('id, generated_thread, status')
    .eq('id', item.draft_id)
    .maybeSingle();
  const thread = (draft as { generated_thread?: GeneratedThread; status?: string } | null)
    ?.generated_thread;
  if (!thread) {
    await supabase
      .from('social_post_queue')
      .update({ status: 'failed', last_error: 'draft/thread missing' })
      .eq('id', item.id);
    return NextResponse.json({ error: 'draft/thread missing' }, { status: 500 });
  }
  const texts = extractThreadTexts(thread, item.lang);
  if (texts.length === 0) {
    await supabase
      .from('social_post_queue')
      .update({ status: 'failed', last_error: 'empty thread texts' })
      .eq('id', item.id);
    return NextResponse.json({ error: 'empty thread texts' }, { status: 500 });
  }

  // Resume: lanjut dari post_index terakhir yang published.
  const { data: publishedLogs } = await supabase
    .from('social_post_logs')
    .select('post_index, threads_media_id')
    .eq('queue_id', item.id)
    .eq('status', 'published')
    .order('post_index', { ascending: false })
    .limit(1);
  const lastLog = (publishedLogs as { post_index: number; threads_media_id: string | null }[] | null)?.[0];
  const startIndex = lastLog ? lastLog.post_index + 1 : 0;
  const parentMediaId = lastLog?.threads_media_id ?? undefined;
  if (startIndex >= texts.length) {
    await supabase
      .from('social_post_queue')
      .update({ status: 'posted', posted_at: new Date().toISOString() })
      .eq('id', item.id);
    return NextResponse.json({ posted: true, resumed: true, queueId: item.id });
  }

  try {
    let lastMediaId = parentMediaId;
    await publishThreadChain(fetch, {
      threadsUserId: account.threads_user_id,
      token,
      texts,
      startIndex,
      parentMediaId,
      onPost: async (index, result) => {
        lastMediaId = result.mediaId;
        await supabase.from('social_post_logs').insert({
          queue_id: item.id,
          draft_id: item.draft_id,
          post_index: index,
          container_id: result.containerId,
          threads_media_id: result.mediaId,
          status: 'published'
        });
      }
    });
    await supabase
      .from('social_post_queue')
      .update({
        status: 'posted',
        posted_at: new Date().toISOString(),
        posted_url: lastMediaId
          ? `https://www.threads.com/@${account.handle.replace(/^@/, '')}/post/${lastMediaId}`
          : null,
        last_error: null
      })
      .eq('id', item.id);
    return NextResponse.json({ posted: true, queueId: item.id, posts: texts.length - startIndex });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await supabase.from('social_post_logs').insert({
      queue_id: item.id,
      draft_id: item.draft_id,
      post_index: startIndex,
      status: 'failed',
      error_code: message.slice(0, 300)
    });
    // Retryable (429/5xx) → kembali queued untuk tick berikutnya; permanen → failed.
    if (isRetryable(message) && item.attempts + 1 < MAX_ATTEMPTS) {
      await supabase
        .from('social_post_queue')
        .update({ status: 'queued', last_error: message.slice(0, 500) })
        .eq('id', item.id);
    } else {
      await supabase
        .from('social_post_queue')
        .update({ status: 'failed', last_error: message.slice(0, 500) })
        .eq('id', item.id);
    }
    return NextResponse.json({ error: message, queueId: item.id }, { status: 502 });
  }
}
