'use client';

import { Fragment, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { CopyButton } from './CopyButton';
import { AffiliateProductCard } from './AffiliateProductCard';
import { PostImageControl } from './PostImageControl';
import { DraftImageCard, type ImageOption } from './DraftImageCard';
import type { DraftImageRow } from '@/lib/image/types';
import { countPlaceholdersInThread } from '@/lib/llm/prompt';
import { createSupabaseBrowser } from '@/lib/supabase/client';
import { approveDraftAndQueue } from '@/lib/social/actions';

export interface DraftQueueInfo {
  status: string;
  scheduled_at: string;
  posted_url: string | null;
}

interface Draft {
  id: string;
  request_id: string;
  generated_thread: { main: { id: string; en: string }; replies: { id: string; en: string }[] };
  affiliate_injections: { id?: string; friendly_code: string; url: string; post_index: number; match_score?: number; match_signals?: { category_match?: boolean; keyword_overlap?: number; scored_from_pool_size?: number }; product_name_id?: string; product_name_en?: string; product_image?: string; product_category?: string; product_merchant?: string }[];
  status: string;
  llm_meta?: { provider: string; model: string; max_chars?: number | null; over_limit?: boolean | null; length_audit?: { post: number; lang: string; chars: number; max: number }[] | null; emoji_missing?: boolean | null };
  affiliate_match_score?: number | null;
  research_topic_id?: string | null;
  platform_slug?: string | null;
}

export function ContentDraftCard({ draft: initial, regenProviders = [], regenModels = [], replyImages = [], perReplyEnabled = false, coverImages = [], coverSelectedId = null, imageOptions = { providers: [], models: [], styles: [], subjects: [] }, queue = null }: {
  draft: Draft;
  regenProviders?: { id: string; slug: string; display_name: string }[];
  regenModels?: { id: string; provider_id: string; model_id: string; display_name: string; priority: number; config: Record<string, unknown> | null }[];
  /** Riwayat gambar per-reply (post_index ≥ 1, terbaru dulu — dari server, tanpa secret). */
  replyImages?: DraftImageRow[];
  /** True bila mode per-reply aktif (global/sesi/draf). */
  perReplyEnabled?: boolean;
  /** History cover (post 0) untuk panel di antara post utama dan balasan 1. */
  coverImages?: DraftImageRow[];
  coverSelectedId?: string | null;
  imageOptions?: ImageOption;
  /** Info antrean posting (dari server, null bila belum terjadwal). */
  queue?: DraftQueueInfo | null;
}) {
  const t = useTranslations('content.review');
  const [draft, setDraft] = useState(initial);
  const [queueInfo, setQueueInfo] = useState(queue);
  const [lang, setLang] = useState<'id' | 'en'>('id');
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editText, setEditText] = useState('');
  const [saving, setSaving] = useState(false);
  const [statusUpdating, setStatusUpdating] = useState<'approved' | 'rejected' | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [queueNote, setQueueNote] = useState<string | null>(null);

  // Sync dari server (mis. setelah reselect/regen + router.refresh()): prop
  // baru = data baru. Tanpa ini state basi dan user harus refresh manual.
  const prevInitial = useRef(initial);
  if (prevInitial.current !== initial) {
    prevInitial.current = initial;
    setDraft(initial);
    setEditingIdx(null);
  }
  const prevQueue = useRef(queue);
  if (prevQueue.current !== queue) {
    prevQueue.current = queue;
    setQueueInfo(queue);
  }

  const injections = draft.affiliate_injections[0];
  const allPosts = [draft.generated_thread.main, ...draft.generated_thread.replies];
  const platformSlug = draft.platform_slug ?? 'all';
  const maxChars = draft.llm_meta?.max_chars ?? null;
  const overLimit = Boolean(draft.llm_meta?.over_limit);
  const emojiMissing = Boolean(draft.llm_meta?.emoji_missing);

  async function updateStatus(status: 'approved' | 'rejected') {
    const previousStatus = draft.status;
    setStatusUpdating(status);
    setStatusError(null);
    setQueueNote(null);
    if (status === 'rejected') {
      // Tolak tetap update langsung (tidak masuk antrean).
      const supabase = createSupabaseBrowser();
      if (!supabase) {
        setStatusUpdating(null);
        return;
      }
      setDraft({ ...draft, status });
      const { error } = await supabase
        .from('content_drafts')
        .update({ status })
        .eq('id', draft.id);
      setStatusUpdating(null);
      if (error) {
        setDraft({ ...draft, status: previousStatus });
        setStatusError(error.message);
      }
      return;
    }
    // Approve via server action: update status + enqueue idempoten (bahasa aktif).
    // Optimistic update; rollback bila server action gagal.
    setDraft({ ...draft, status });
    try {
      const result = await approveDraftAndQueue(draft.id, lang);
      if (result.queued && result.scheduledAt) {
        setQueueInfo({ status: 'queued', scheduled_at: result.scheduledAt, posted_url: null });
        setQueueNote(t('approveQueued', { when: new Date(result.scheduledAt).toLocaleString() }));
      } else {
        setQueueNote(t('approveNoQueue'));
      }
    } catch (e) {
      setDraft({ ...draft, status: previousStatus });
      setStatusError(e instanceof Error ? e.message : String(e));
    } finally {
      setStatusUpdating(null);
    }
  }

  async function saveEdit(idx: number) {
    setSaving(true);
    const supabase = createSupabaseBrowser();
    if (!supabase) {
      setSaving(false);
      return;
    }
    // Edit per post (0 = main, 1..n = replies), bukan hanya main post.
    const posts = [draft.generated_thread.main, ...draft.generated_thread.replies];
    const target = posts[idx];
    if (!target) {
      setSaving(false);
      return;
    }
    const updated = { ...target, [lang]: editText };
    const newThread = idx === 0
      ? { ...draft.generated_thread, main: updated }
      : { ...draft.generated_thread, replies: draft.generated_thread.replies.map((r, i) => (i === idx - 1 ? updated : r)) };
    const { error } = await supabase
      .from('content_drafts')
      .update({ generated_thread: newThread as unknown as string })
      .eq('id', draft.id);
    if (!error) {
      setDraft({ ...draft, generated_thread: newThread });
      setEditingIdx(null);
    }
    setSaving(false);
  }

  const threadText = allPosts.map((p) => (lang === 'id' ? p.id : p.en)).join('\n\n---\n\n');

  const isApproving = statusUpdating === 'approved';
  const isRejecting = statusUpdating === 'rejected';
  const isUpdating = isApproving || isRejecting;

  return (
    <article className="rounded-xl border border-line bg-surface p-4 shadow-card sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="chip bg-primary/10 text-primary">
          {t('productChip', { code: injections?.friendly_code?.replace('ASH-', '') ?? '?' })}
        </span>
        <span className="chip border border-line bg-surface text-ink" title={maxChars ? t('platformMaxHint', { max: maxChars }) : undefined}>
          {platformSlug}{maxChars ? ` · ≤${maxChars}` : ''}
        </span>
        <span className="text-xs text-ink-muted">{draft.llm_meta?.provider} · {draft.llm_meta?.model}</span>
      </div>

      {overLimit ? (
        <p role="alert" className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-800">
          {t('charOverLimit')}
        </p>
      ) : null}

      {emojiMissing ? (
        <p role="status" className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {t('emojiMissingNote')}
        </p>
      ) : null}

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => setLang('id')}
          aria-pressed={lang === 'id'}
          className={lang === 'id' ? 'chip bg-primary text-white' : 'chip border border-line bg-surface text-ink'}
        >
          {t('tabId')}
        </button>
        <button
          type="button"
          onClick={() => setLang('en')}
          aria-pressed={lang === 'en'}
          className={lang === 'en' ? 'chip bg-primary text-white' : 'chip border border-line bg-surface text-ink'}
        >
          {t('tabEn')}
        </button>
      </div>

      <div className="mt-4 space-y-4">
        {allPosts.map((post, idx) => {
          const label = idx === 0 ? t('postMain') : t('reply', { n: idx });
          const text = lang === 'id' ? post.id : post.en;
          const isInjected = injections?.post_index === idx;
          const len = text.length;
          const over = maxChars != null && len > maxChars;
          const near = maxChars != null && !over && len >= Math.floor(maxChars * 0.9);
          return (
            <Fragment key={idx}>
            <div className={isInjected ? 'rounded-lg border border-primary/30 bg-primary/5 p-3' : 'rounded-lg border border-line bg-background p-3'}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-ink">{label} {isInjected ? '· ASH-' + injections.friendly_code.replace('ASH-','') : ''}</span>
                <span className="flex items-center gap-2">
                  {maxChars != null ? (
                    <span className={`text-[11px] tabular-nums ${over ? 'font-semibold text-red-700' : near ? 'text-amber-700' : 'text-ink-muted'}`} title={over ? t('charOverLimitPost', { chars: len, max: maxChars }) : t('charCountHint', { chars: len, max: maxChars })}>
                      {len}/{maxChars}
                    </span>
                  ) : null}
                  {editingIdx === idx ? (
                    <button
                      type="button"
                      onClick={() => saveEdit(idx)}
                      disabled={saving}
                      className="btn-primary px-2 py-1 text-[11px] disabled:opacity-60"
                    >
                      {saving ? '...' : t('save')}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setEditText(text);
                        setEditingIdx(idx);
                      }}
                      className="rounded-md border border-line bg-surface px-2 py-1 text-[11px] font-medium text-ink hover:border-primary"
                    >
                      {t('edit')}
                    </button>
                  )}
                  <CopyButton text={text} />
                </span>
              </div>
              {editingIdx === idx ? (
                <textarea
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  rows={4}
                  className="mt-2 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm"
                />
              ) : (
                <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-ink">{text}</p>
              )}
              {injections && isInjected ? (
                text.includes(injections.url) ? null : (
                  <a
                    href={injections.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="mt-1 block break-words text-xs text-primary underline"
                  >
                    {injections.url} ↗
                  </a>
                )
              ) : null}
              {idx === 0 ? null : (
                <PostImageControl
                  draftId={draft.id}
                  postIndex={idx}
                  initialHistory={replyImages.filter((i) => (i.post_index ?? 0) === idx)}
                  isAffiliate={isInjected}
                  perReplyEnabled={perReplyEnabled}
                  options={{ models: imageOptions.models, styles: imageOptions.styles, subjects: imageOptions.subjects, cameras: imageOptions.cameras }}
                />
              )}
            </div>
            {idx === 0 ? (
              <DraftImageCard
                draftId={draft.id}
                initialImages={coverImages}
                initialSelectedId={coverSelectedId}
                options={imageOptions}
                compact
              />
            ) : null}
            </Fragment>
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <CopyButton text={threadText} label={t('copyAllFor', { platform: platformSlug })} />
        <button
          type="button"
          onClick={() => updateStatus('approved')}
          disabled={draft.status === 'approved' || isUpdating}
          aria-busy={isApproving}
          className="ml-auto btn-primary flex items-center gap-1 px-3 py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-70"
        >
          {isApproving ? (
            <>
              <svg viewBox="0 0 20 20" fill="none" className="size-3 animate-spin" aria-hidden>
                <circle cx="10" cy="10" r="8" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
                <path d="M18 10a8 8 0 00-8-8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
              </svg>
              <span>...</span>
            </>
          ) : (
            t('approve')
          )}
        </button>
        <button
          type="button"
          onClick={() => updateStatus('rejected')}
          disabled={draft.status === 'rejected' || isUpdating}
          aria-busy={isRejecting}
          className="rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-medium text-red-700 hover:border-red-300 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {isRejecting ? (
            <span className="inline-flex items-center gap-1">
              <svg viewBox="0 0 20 20" fill="none" className="size-3 animate-spin" aria-hidden>
                <circle cx="10" cy="10" r="8" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
                <path d="M18 10a8 8 0 00-8-8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
              </svg>
              ...
            </span>
          ) : (
            t('reject')
          )}
        </button>
      </div>

      {statusError ? (
        <p role="alert" className="mt-2 text-xs text-red-700">
          {statusError}
        </p>
      ) : null}

      {queueNote ? (
        <p role="status" className="mt-2 rounded-lg bg-green-50 px-3 py-2 text-xs text-green-800">
          {queueNote}
        </p>
      ) : null}

      {draft.status === 'approved' ? (
        <p className="mt-2 text-xs text-ink-muted">{t('approveQueueNote')}</p>
      ) : null}

      {queueInfo ? (
        <p className="mt-1 text-xs text-ink-muted">
          {t('queueBadge', {
            status: queueInfo.status,
            when: new Date(queueInfo.scheduled_at).toLocaleString()
          })}
          {queueInfo.posted_url ? (
            <>
              {' · '}
              <a href={queueInfo.posted_url} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                {queueInfo.posted_url}
              </a>
            </>
          ) : null}
        </p>
      ) : null}

      {draft.status !== 'needs_review' ? <p className="mt-2 text-xs text-ink-muted">Status: {draft.status}</p> : null}

      <AffiliateProductCard
        draftId={draft.id}
        injection={draft.affiliate_injections[0] ?? null}
        matchScore={draft.affiliate_match_score ?? null}
        hasPlaceholderWarning={countPlaceholdersInThread(draft.generated_thread) > 0 && draft.affiliate_injections.length === 0}
        regenProviders={regenProviders}
        regenModels={regenModels}
      />
    </article>
  );
}
