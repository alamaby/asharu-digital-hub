'use client';

import { useState } from 'react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import type { ParsedArticleDraft } from '@/lib/llm/prompt';
import { ARTICLE_MIN_WORDS, countArticleWords, findAffiliateSectionIndex, findCjkHit } from '@/lib/llm/prompt';
import { approveArticleAndPublish, expandArticleDraft, updateArticleDraft, rejectArticleDraft } from '@/lib/articles/actions';
import { renderArticleMarkdown, type ArticleLocale } from '@/lib/articles/types';
import { ArticlePublicView, renderRichText } from '@/components/articles/ArticlePublicView';
import { StageModelPicker } from './StageModelPicker';

export interface ArticleAffiliateInfo {
  url: string | null;
  name?: string | null;
  image?: string | null;
  merchant?: string | null;
  friendlyCode?: string | null;
}

export interface ArticleDraftCardProps {
  draftId: string;
  status: string;
  article: ParsedArticleDraft;
  /** Bahasa sesi riset: 'id' | 'en' | 'both' | null (null = boleh keduanya). */
  sessionLanguage: string | null;
  published: { locale: string; slug: string }[];
  /** Info produk afiliasi (dari affiliate_injections) untuk visual section. */
  affiliate?: ArticleAffiliateInfo | null;
  /** URL cover terpilih (untuk pratinjau); null = tanpa cover seperti publik. */
  coverUrl?: string | null;
  /** Katalog provider/model aktif untuk picker model expand. */
  expandProviders?: { id: string; slug: string; display_name: string }[];
  expandModels?: { id: string; provider_id: string; model_id: string; display_name: string; priority: number; config: Record<string, unknown> | null }[];
}

/**
 * Badge peringatan live bila sebuah field masih memuat karakter CJK.
 * Membantu admin melihat SEMUA titik tersisa sebelum klik Simpan
 * (server menolak save selama masih ada 1 titik pun).
 */
function CjkBadge({ value }: { value: string }) {
  const t = useTranslations('content.review');
  const hit = findCjkHit(value ?? '');
  if (!hit) return null;
  return (
    <span className="ml-2 inline-block rounded bg-red-100 px-1.5 py-0.5 align-middle text-[11px] font-semibold text-red-700">
      {t('articleCjkWarn', { hit })}
    </span>
  );
}

/**
 * Kartu review draf artikel long-form: pratinjau per bahasa + publish
 * per bahasa ke tabel `articles`. Pengganti ContentDraftCard (thread)
 * khusus platform `artikel`.
 */
export function ArticleDraftCard({ draftId, status, article, sessionLanguage, published, affiliate = null, coverUrl = null, expandProviders = [], expandModels = [] }: ArticleDraftCardProps) {
  const t = useTranslations('content.review');
  const router = useRouter();
  const available = (['id', 'en'] as const).filter((l) => article[l]);
  const [lang, setLang] = useState<'id' | 'en'>(available[0] ?? 'id');
  const [view, setView] = useState<'draft' | 'preview'>('draft');
  const [selected, setSelected] = useState<ArticleLocale[]>(() => [...available]);
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [publishOk, setPublishOk] = useState<{ locale: string; slug: string }[] | null>(null);
  const [expanding, setExpanding] = useState(false);
  const [expandError, setExpandError] = useState<string | null>(null);
  const [expandOk, setExpandOk] = useState<string | null>(null);
  const [expandProviderId, setExpandProviderId] = useState('');
  const [expandModelId, setExpandModelId] = useState('');
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveOk, setSaveOk] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [rejectOk, setRejectOk] = useState<string | null>(null);

  // Edit form state — satu locale yang sedang diedit (lazy init, content tersedia nanti)
  type EditSection = { h2: string; body: string };
  type EditFaq = { q: string; a: string };
  const [editTitle, setEditTitle] = useState('');
  const [editSlug, setEditSlug] = useState('');
  const [editExcerpt, setEditExcerpt] = useState('');
  const [editSections, setEditSections] = useState<EditSection[]>([]);
  const [editFaq, setEditFaq] = useState<EditFaq[]>([]);
  const [editMetaTitle, setEditMetaTitle] = useState('');
  const [editMetaDesc, setEditMetaDesc] = useState('');
  const [editLang, setEditLang] = useState<'id' | 'en'>('id');

  function startEdit() {
    if (!content) return;
    setEditTitle(content.title);
    setEditSlug(content.slug);
    setEditExcerpt(content.excerpt);
    setEditSections([...content.sections]);
    setEditFaq([...content.faq]);
    setEditMetaTitle(content.meta_title);
    setEditMetaDesc(content.meta_desc);
    setEditLang(lang);
    setEditing(true);
    setSaveError(null);
    setSaveOk(null);
  }

  function resetEditForm() {
    if (content) {
      setEditTitle(content.title);
      setEditSlug(content.slug);
      setEditExcerpt(content.excerpt);
      setEditSections([...content.sections]);
      setEditFaq([...content.faq]);
      setEditMetaTitle(content.meta_title);
      setEditMetaDesc(content.meta_desc);
    }
    setEditing(false);
    setSaveError(null);
    setSaveOk(null);
  }

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    setSaveOk(null);
    try {
      const result = await updateArticleDraft(draftId, {
        locale: editLang,
        title: editTitle,
        slug: editSlug,
        excerpt: editExcerpt,
        sections: editSections,
        faq: editFaq,
        meta_title: editMetaTitle,
        meta_desc: editMetaDesc
      });
      if (!result.success) {
        setSaveError(result.error ?? 'save failed');
      } else {
        setSaveOk('Tersimpan');
        router.refresh();
      }
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function handleReject() {
    setRejecting(true);
    setRejectOk(null);
    try {
      const result = await rejectArticleDraft(draftId);
      if (!result.success) {
        alert(result.error ?? 'reject failed');
      } else {
        setRejectOk(t('articleRejected'));
        router.refresh();
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setRejecting(false);
    }
  }

  function addSection() {
    setEditSections((prev) => [...prev, { h2: '', body: '' }]);
  }
  function removeSection(idx: number) {
    setEditSections((prev) => prev.filter((_, i) => i !== idx));
  }
  function updateSection(idx: number, field: 'h2' | 'body', value: string) {
    setEditSections((prev) => prev.map((s, i) => i === idx ? { ...s, [field]: value } : s));
  }
  function addFaq() {
    setEditFaq((prev) => [...prev, { q: '', a: '' }]);
  }
  function removeFaq(idx: number) {
    setEditFaq((prev) => prev.filter((_, i) => i !== idx));
  }
  function updateFaq(idx: number, field: 'q' | 'a', value: string) {
    setEditFaq((prev) => prev.map((f, i) => i === idx ? { ...f, [field]: value } : f));
  }

  const content = article[lang];
  const words = content ? countArticleWords(content) : 0;
  const thin = words < ARTICLE_MIN_WORDS;
  const affiliateIdx = content ? findAffiliateSectionIndex(content.sections, affiliate?.url) : -1;
  const allowed: ArticleLocale[] =
    !sessionLanguage || sessionLanguage === 'both'
      ? ['id', 'en']
      : sessionLanguage === 'en'
        ? ['en']
        : ['id'];

  async function handlePublish() {
    setPublishing(true);
    setPublishError(null);
    setPublishOk(null);
    try {
      const result = await approveArticleAndPublish(draftId, selected);
      if (!result.success) {
        setPublishError(result.error ?? 'publish failed');
      } else {
        setPublishOk(result.published ?? []);
      }
    } catch (e) {
      setPublishError(e instanceof Error ? e.message : String(e));
    } finally {
      setPublishing(false);
    }
  }

  async function handleExpand() {
    setExpanding(true);
    setExpandError(null);
    setExpandOk(null);
    try {
      const result = await expandArticleDraft(draftId, expandModelId ? { modelId: expandModelId } : undefined);
      if (!result.success) {
        setExpandError(result.error ?? t('articleExpandError'));
      } else if (result.expanded) {
        const total = Object.values(result.words ?? {}).join('/');
        setExpandOk(t('articleExpandOk', { words: total }));
        router.refresh();
      } else {
        const total = Object.values(result.words ?? {}).join('/');
        setExpandOk(t('articleExpandOk', { words: total }));
      }
    } catch (e) {
      setExpandError(e instanceof Error ? e.message : String(e));
    } finally {
      setExpanding(false);
    }
  }

  if (!content) {
    return (
      <article className="rounded-xl border border-line bg-surface p-4 shadow-card sm:p-6">
        <p role="alert" className="text-sm text-red-700">{t('articleEmpty')}</p>
      </article>
    );
  }

  // Hitung field form edit yang masih memuat CJK (live, sebelum save).
  const cjkFieldCount =
    (findCjkHit(editTitle ?? '') ? 1 : 0) +
    (findCjkHit(editExcerpt ?? '') ? 1 : 0) +
    editSections.filter((s) => findCjkHit(s.h2 ?? '') || findCjkHit(s.body ?? '')).length +
    editFaq.filter((f) => findCjkHit(f.q ?? '') || findCjkHit(f.a ?? '')).length +
    (findCjkHit(editMetaTitle ?? '') ? 1 : 0) +
    (findCjkHit(editMetaDesc ?? '') ? 1 : 0);

  return (
    <article className="rounded-xl border border-line bg-surface p-4 shadow-card sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="chip bg-primary/10 text-primary">artikel</span>
        <span className="chip border border-line bg-surface text-ink text-xs">
          {status === 'rejected' ? 'Ditolak' : status === 'needs_review' ? 'Perlu Review' : status}
        </span>
        <button
          type="button"
          onClick={startEdit}
          disabled={editing}
          className="btn-secondary px-3 py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-50"
        >
          {editing ? t('articleEditing') : t('articleEdit')}
        </button>
      </div>

      {thin ? (
        <div role="alert" className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-800">
          <p>{t('articleThin', { min: ARTICLE_MIN_WORDS, words })}</p>
          {expandProviders.length > 0 ? (
            <div className="mt-2">
              <StageModelPicker
                stage="expand_article"
                label={t('articleExpandModelLabel')}
                providers={expandProviders}
                models={expandModels}
                providerId={expandProviderId}
                modelId={expandModelId}
                onProviderChange={setExpandProviderId}
                onModelChange={setExpandModelId}
                disabled={expanding || publishing}
              />
            </div>
          ) : null}
          <button
            type="button"
            onClick={handleExpand}
            disabled={expanding || publishing}
            aria-busy={expanding}
            className="mt-2 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white disabled:cursor-not-allowed disabled:opacity-70"
          >
            {expanding ? t('articleExpandWorking') : t('articleExpand', { min: ARTICLE_MIN_WORDS })}
          </button>
          {expandError ? <p className="mt-1 font-medium">{t('articleExpandError')}: {expandError}</p> : null}
          {expandOk ? <p className="mt-1 font-medium text-green-800">{expandOk}</p> : null}
        </div>
      ) : null}

      {affiliate?.url ? (
        <div className="mt-3 flex items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 p-3">
          {affiliate.image ? (
            <Image
              src={affiliate.image}
              alt={affiliate.name ?? affiliate.friendlyCode ?? 'produk afiliasi'}
              width={64}
              height={64}
              className="size-16 shrink-0 rounded-lg border border-line object-cover"
              loading="lazy"
            />
          ) : null}
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{t('articleAffiliateBox')}</p>
            {affiliate.name ? <p className="truncate text-sm font-medium text-ink">{affiliate.name}</p> : null}
            {affiliate.merchant ? <p className="text-xs text-ink-muted">{affiliate.merchant}</p> : null}
            <a href={affiliate.url} target="_blank" rel="noreferrer noopener" className="break-words text-xs text-primary underline">
              {affiliate.url} ↗
            </a>
          </div>
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {(['id', 'en'] as const).map((l) =>
          article[l] ? (
            <button
              key={l}
              type="button"
              onClick={() => setLang(l)}
              aria-pressed={lang === l}
              className={lang === l ? 'chip bg-primary text-white' : 'chip border border-line bg-surface text-ink'}
            >
              {l === 'id' ? t('tabId') : t('tabEn')}
            </button>
          ) : null
        )}
        <span aria-hidden className="mx-1 h-4 w-px bg-line" />
        {(['draft', 'preview'] as const).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setView(v)}
            aria-pressed={view === v}
            className={view === v ? 'chip bg-primary text-white' : 'chip border border-line bg-surface text-ink'}
          >
            {v === 'draft' ? t('articleTabDraft') : t('articleTabPreview')}
          </button>
        ))}
      </div>

      {view === 'draft' ? (
      <>
      <h2 className="mt-4 text-xl font-bold tracking-tight text-ink">{content.title}</h2>
      <p className="mt-1 text-xs text-ink-muted">/{content.slug}</p>
      <p className="mt-3 leading-relaxed text-ink-muted">{content.excerpt}</p>

      <div className="mt-4 space-y-4">
        {content.sections.map((s, i) => {
          const isAffiliate = i === affiliateIdx;
          return (
            <section
              key={i}
              className={`rounded-lg border p-3 ${isAffiliate ? 'border-primary/40 bg-primary/5' : 'border-line bg-background'}`}
            >
              <h3 className="text-sm font-semibold text-ink">{s.h2}</h3>
              {isAffiliate ? (
                <p className="mt-1 flex items-center gap-2 text-[11px] font-medium text-primary">
                  {affiliate?.image ? (
                    <Image
                      src={affiliate.image}
                      alt={affiliate.name ?? ''}
                      width={24}
                      height={24}
                      className="size-6 rounded object-cover"
                      loading="lazy"
                    />
                  ) : null}
                  {t('articleAffiliateVisual')}
                </p>
              ) : null}
              <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-ink">{renderRichText(s.body)}</p>
            </section>
          );
        })}
      </div>

      {content.faq.length > 0 ? (
        <div className="mt-4">
          <h3 className="text-sm font-semibold text-ink">{t('articleFaq')}</h3>
          <div className="mt-2 space-y-2">
            {content.faq.map((f, i) => (
              <details key={i} className="rounded-lg border border-line bg-background p-3">
                <summary className="cursor-pointer text-sm font-medium text-ink">{f.q}</summary>
                <p className="mt-1 text-sm text-ink-muted">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      ) : null}

      <p className="mt-4 text-xs text-ink-muted">
        SEO: {content.meta_title} · {content.meta_desc}
      </p>

      {published.length > 0 ? (
        <p className="mt-2 text-xs text-ink-muted">
          {t('articlePublished')}:{' '}
          {published.map((p) => (
            <a
              key={p.locale}
              href={`/${p.locale === 'id' ? 'id/artikel' : 'en/articles'}/${p.slug}`}
              target="_blank"
              rel="noreferrer"
              className="mr-2 text-primary underline"
            >
              {p.locale}/{p.slug} ↗
            </a>
          ))}
        </p>
      ) : null}

      </>
      ) : (
        <div className="mt-4 rounded-xl border border-dashed border-primary/50 bg-background p-4 sm:p-6">
          <p role="status" className="rounded-lg bg-primary/10 px-3 py-2 text-xs text-primary">
            {t('articlePreviewBadge')}
          </p>
          <div className="mx-auto max-w-3xl">
            <ArticlePublicView
              title={content.title}
              excerpt={content.excerpt}
              dateLine={null}
              coverUrl={coverUrl}
              bodyMd={renderArticleMarkdown(content)}
              affiliate={affiliate?.url ? {
                name: affiliate.name ?? null,
                url: affiliate.url,
                image: affiliate.image ?? null
              } : null}
              affiliateTitle={t('articlePreviewAffiliateTitle')}
              affiliateBody={affiliate?.name ? t('articlePreviewAffiliateBody', { product: affiliate.name }) : t('articlePreviewAffiliateBodyNoName')}
              affiliateCta={t('articlePreviewAffiliateCta')}
              affiliateNote={t('articlePreviewAffiliateNote')}
              faqHeading={t('articlePreviewFaq')}
              faq={content.faq}
              disclosureNote={t('articlePreviewDisclosure')}
              disclosureLinkLabel={null}
              disclosureHref={null}
            />
          </div>
        </div>
      )}

      <fieldset className="mt-4 rounded-lg border border-line bg-background p-3">
        <legend className="px-1 text-xs font-medium text-ink">{t('articlePublish')}</legend>
        <div className="flex flex-wrap gap-3">
          {(['id', 'en'] as const).map((l) => {
            const ok = Boolean(article[l]) && allowed.includes(l);
            return (
              <label key={l} className={`flex items-center gap-2 text-sm ${ok ? 'text-ink' : 'text-ink-muted'}`}>
                <input
                  type="checkbox"
                  checked={selected.includes(l)}
                  disabled={!ok || publishing}
                  onChange={(e) =>
                    setSelected((prev) => (e.target.checked ? [...prev, l] : prev.filter((x) => x !== l)))
                  }
                  className="size-4 accent-[var(--color-primary)]"
                />
                {l === 'id' ? t('articlePublishId') : t('articlePublishEn')}
                {!article[l] ? ` (${t('articleMissingLang')})` : ''}
              </label>
            );
          })}
        </div>
        <button
          type="button"
          onClick={handlePublish}
          disabled={publishing || selected.length === 0}
          aria-busy={publishing}
          className="btn-primary mt-3 px-3 py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-70"
        >
          {publishing ? '...' : t('articlePublishAction')}
        </button>
        {publishError ? (
          <p role="alert" className="mt-2 text-xs text-red-700">{publishError}</p>
        ) : null}
        {publishOk ? (
          <p role="status" className="mt-2 rounded-lg bg-green-50 px-3 py-2 text-xs text-green-800">
            {t('articlePublishOk')}: {publishOk.map((p) => `${p.locale}/${p.slug}`).join(', ')}
          </p>
        ) : null}
        <button
          type="button"
          onClick={handleReject}
          disabled={rejecting}
          aria-busy={rejecting}
          className="mt-3 border border-red-300 px-3 py-1.5 text-xs text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {rejecting ? '...' : t('articleReject')}
        </button>
        {rejectOk ? (
          <p role="status" className="mt-2 text-xs text-red-700">{rejectOk}</p>
        ) : null}
      </fieldset>

      {/* Edit mode */}
      {editing ? (
        <div className="mt-4 space-y-4 rounded-lg border border-dashed border-primary/40 bg-primary/5 p-4">
          <p className="text-sm font-semibold text-primary">{t('articleEditHeader')}</p>
          {cjkFieldCount > 0 ? (
            <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-800">
              {t('articleCjkRemaining', { n: cjkFieldCount })}
            </p>
          ) : null}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-ink-muted">{t('articleEditTitle')}<CjkBadge value={editTitle} /></label>
              <input
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                className="w-full rounded-md border border-line bg-surface px-3 py-1.5 text-sm text-ink"
                maxLength={200}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-ink-muted">{t('articleEditSlug')}</label>
              <input
                type="text"
                value={editSlug}
                onChange={(e) => setEditSlug(e.target.value.toLowerCase())}
                className="w-full rounded-md border border-line bg-surface px-3 py-1.5 text-sm text-ink"
                placeholder="tips-memilih-keyboard-wfh"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-ink-muted">{t('articleEditExcerpt')}<CjkBadge value={editExcerpt} /></label>
            <textarea
              value={editExcerpt}
              onChange={(e) => setEditExcerpt(e.target.value)}
              rows={3}
              className="w-full rounded-md border border-line bg-surface px-3 py-1.5 text-sm text-ink"
            />
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="text-xs font-medium text-ink-muted">{t('articleEditSections')}</label>
              <button
                type="button"
                onClick={addSection}
                className="text-xs text-primary hover:underline"
              >
                + {t('articleAddSection')}
              </button>
            </div>
            <div className="space-y-3">
              {editSections.map((s, i) => (
                <div key={i} className="rounded-md border border-line bg-background p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-ink-muted">{t('articleSection', { n: i + 1 })}<CjkBadge value={`${s.h2 ?? ''} ${s.body ?? ''}`} /></span>
                    <button
                      type="button"
                      onClick={() => removeSection(i)}
                      disabled={editSections.length <= 3}
                      className="text-xs text-red-600 hover:underline disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {t('articleRemove')}
                    </button>
                  </div>
                  <input
                    type="text"
                    value={s.h2}
                    onChange={(e) => updateSection(i, 'h2', e.target.value)}
                    placeholder="H2 title"
                    className="mt-2 w-full rounded-md border border-line bg-surface px-3 py-1.5 text-sm text-ink"
                  />
                  <textarea
                    value={s.body}
                    onChange={(e) => updateSection(i, 'body', e.target.value)}
                    rows={4}
                    placeholder="Body text..."
                    className="mt-2 w-full rounded-md border border-line bg-surface px-3 py-1.5 text-sm text-ink"
                  />
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="text-xs font-medium text-ink-muted">{t('articleEditFaq')}</label>
              <button
                type="button"
                onClick={addFaq}
                className="text-xs text-primary hover:underline"
              >
                + {t('articleAddFaq')}
              </button>
            </div>
            <div className="space-y-3">
              {editFaq.map((f, i) => (
                <div key={i} className="rounded-md border border-line bg-background p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-ink-muted">FAQ #{i + 1}<CjkBadge value={`${f.q ?? ''} ${f.a ?? ''}`} /></span>
                    <button
                      type="button"
                      onClick={() => removeFaq(i)}
                      disabled={editFaq.length <= 1}
                      className="text-xs text-red-600 hover:underline disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {t('articleRemove')}
                    </button>
                  </div>
                  <input
                    type="text"
                    value={f.q}
                    onChange={(e) => updateFaq(i, 'q', e.target.value)}
                    placeholder="Question..."
                    className="mt-2 w-full rounded-md border border-line bg-surface px-3 py-1.5 text-sm text-ink"
                  />
                  <textarea
                    value={f.a}
                    onChange={(e) => updateFaq(i, 'a', e.target.value)}
                    rows={3}
                    placeholder="Answer..."
                    className="mt-2 w-full rounded-md border border-line bg-surface px-3 py-1.5 text-sm text-ink"
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-ink-muted">{t('articleEditMetaTitle')}<CjkBadge value={editMetaTitle} /></label>
              <input
                type="text"
                value={editMetaTitle}
                onChange={(e) => setEditMetaTitle(e.target.value)}
                className="w-full rounded-md border border-line bg-surface px-3 py-1.5 text-sm text-ink"
                maxLength={70}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-ink-muted">{t('articleEditMetaDesc')}<CjkBadge value={editMetaDesc} /></label>
              <input
                type="text"
                value={editMetaDesc}
                onChange={(e) => setEditMetaDesc(e.target.value)}
                className="w-full rounded-md border border-line bg-surface px-3 py-1.5 text-sm text-ink"
                maxLength={200}
              />
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs text-ink-muted">
            <span>{t('articleEditLangLabel')}:</span>
            <select
              value={editLang}
              onChange={(e) => setEditLang(e.target.value as 'id' | 'en')}
              className="rounded-md border border-line bg-surface px-2 py-1 text-sm"
            >
              {(['id', 'en'] as const).map((l) => (
                <option key={l} value={l}>{l === 'id' ? 'Indonesia' : 'English'}</option>
              ))}
            </select>
          </div>

          {saveError ? (
            <p role="alert" className="text-xs text-red-700">{saveError}</p>
          ) : null}
          {saveOk ? (
            <p role="status" className="text-xs text-green-700">{saveOk}</p>
          ) : null}

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              aria-busy={saving}
              className="btn-primary px-3 py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-70"
            >
              {saving ? '...' : t('articleSave')}
            </button>
            <button
              type="button"
              onClick={resetEditForm}
              className="border border-line px-3 py-1.5 text-xs text-ink hover:bg-background"
            >
              {t('articleCancel')}
            </button>
          </div>
        </div>
      ) : null}
    </article>
  );
}
