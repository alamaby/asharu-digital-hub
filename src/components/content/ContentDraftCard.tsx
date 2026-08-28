'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { CopyButton } from './CopyButton';
import { createSupabaseBrowser } from '@/lib/supabase/client';

interface Draft {
  id: string;
  request_id: string;
  generated_thread: { main: { id: string; en: string }; replies: { id: string; en: string }[] };
  affiliate_injections: { friendly_code: string; url: string; post_index: number }[];
  status: string;
  llm_meta?: { provider: string; model: string };
}

export function ContentDraftCard({ draft: initial }: { draft: Draft }) {
  const t = useTranslations('content.review');
  const [draft, setDraft] = useState(initial);
  const [lang, setLang] = useState<'id' | 'en'>('id');
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState('');
  const [saving, setSaving] = useState(false);

  const injections = draft.affiliate_injections[0];
  const allPosts = [draft.generated_thread.main, ...draft.generated_thread.replies];

  async function updateStatus(status: 'approved' | 'rejected') {
    const supabase = createSupabaseBrowser();
    if (!supabase) return;
    await supabase.from('content_drafts').update({ status }).eq('id', draft.id);
    setDraft({ ...draft, status });
  }

  async function saveEdit() {
    setSaving(true);
    const supabase = createSupabaseBrowser();
    if (!supabase) return;
    // For MVP, edit only main post id/en (simple)
    const newThread = { ...draft.generated_thread, main: { ...draft.generated_thread.main, [lang]: editText } };
    await supabase.from('content_drafts').update({ generated_thread: newThread as unknown as string }).eq('id', draft.id);
    setDraft({ ...draft, generated_thread: newThread });
    setEditing(false);
    setSaving(false);
  }

  const threadText = allPosts.map((p) => (lang === 'id' ? p.id : p.en)).join('\n\n---\n\n');

  return (
    <article className="rounded-xl border border-line bg-surface p-4 shadow-card sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="chip bg-primary/10 text-primary">
          {t('productChip', { code: injections?.friendly_code?.replace('ASH-', '') ?? '?' })}
        </span>
        <span className="text-xs text-ink-muted">{draft.llm_meta?.provider} · {draft.llm_meta?.model}</span>
      </div>

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
          return (
            <div key={idx} className={isInjected ? 'rounded-lg border border-primary/30 bg-primary/5 p-3' : 'rounded-lg border border-line bg-background p-3'}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-ink">{label} {isInjected ? '· ASH-' + injections.friendly_code.replace('ASH-','') : ''}</span>
                <CopyButton text={text} />
              </div>
              {editing && idx === 0 ? (
                <textarea
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  rows={4}
                  className="mt-2 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm"
                />
              ) : (
                <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-ink">{text}</p>
              )}
              {injections && isInjected ? <p className="mt-1 text-xs text-primary">{injections.url}</p> : null}
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <CopyButton text={threadText} label={t('copyAll')} />
        {!editing ? (
          <button
            type="button"
            onClick={() => {
              setEditText(lang === 'id' ? draft.generated_thread.main.id : draft.generated_thread.main.en);
              setEditing(true);
            }}
            className="rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-medium text-ink hover:border-primary"
          >
            {t('edit')}
          </button>
        ) : (
          <button type="button" onClick={saveEdit} disabled={saving} className="btn-primary px-3 py-1.5 text-xs">
            {saving ? '...' : 'Simpan'}
          </button>
        )}
        <button
          type="button"
          onClick={() => updateStatus('approved')}
          className="ml-auto btn-primary px-3 py-1.5 text-xs"
          disabled={draft.status === 'approved'}
        >
          {t('approve')}
        </button>
        <button
          type="button"
          onClick={() => updateStatus('rejected')}
          className="rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-medium text-red-700 hover:border-red-300"
          disabled={draft.status === 'rejected'}
        >
          {t('reject')}
        </button>
      </div>

      {draft.status !== 'needs_review' ? <p className="mt-2 text-xs text-ink-muted">Status: {draft.status}</p> : null}
    </article>
  );
}
