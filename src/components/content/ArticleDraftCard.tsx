'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { ParsedArticleDraft } from '@/lib/llm/prompt';
import { ARTICLE_MIN_WORDS, countArticleWords } from '@/lib/llm/prompt';
import { approveArticleAndPublish } from '@/lib/articles/actions';
import type { ArticleLocale } from '@/lib/articles/types';

interface Props {
  draftId: string;
  status: string;
  article: ParsedArticleDraft;
  /** Bahasa sesi riset: 'id' | 'en' | 'both' | null (null = boleh keduanya). */
  sessionLanguage: string | null;
  published: { locale: string; slug: string }[];
}

/**
 * Kartu review draf artikel long-form: pratinjau per bahasa + publish
 * per bahasa ke tabel `articles`. Pengganti ContentDraftCard (thread)
 * khusus platform `artikel`.
 */
export function ArticleDraftCard({ draftId, status, article, sessionLanguage, published }: Props) {
  const t = useTranslations('content.review');
  const available = (['id', 'en'] as const).filter((l) => article[l]);
  const [lang, setLang] = useState<'id' | 'en'>(available[0] ?? 'id');
  const [selected, setSelected] = useState<ArticleLocale[]>(() => [...available]);
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [publishOk, setPublishOk] = useState<{ locale: string; slug: string }[] | null>(null);

  const content = article[lang];
  const words = content ? countArticleWords(content) : 0;
  const thin = words < ARTICLE_MIN_WORDS;
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

  if (!content) {
    return (
      <article className="rounded-xl border border-line bg-surface p-4 shadow-card sm:p-6">
        <p role="alert" className="text-sm text-red-700">{t('articleEmpty')}</p>
      </article>
    );
  }

  return (
    <article className="rounded-xl border border-line bg-surface p-4 shadow-card sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="chip bg-primary/10 text-primary">artikel</span>
        <span className="text-xs text-ink-muted">
          {t('articleWords', { words })} · {status}
        </span>
      </div>

      {thin ? (
        <p role="alert" className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-800">
          {t('articleThin', { min: ARTICLE_MIN_WORDS, words })}
        </p>
      ) : null}

      <div className="mt-3 flex gap-2">
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
      </div>

      <h2 className="mt-4 text-xl font-bold tracking-tight text-ink">{content.title}</h2>
      <p className="mt-1 text-xs text-ink-muted">/{content.slug}</p>
      <p className="mt-3 leading-relaxed text-ink-muted">{content.excerpt}</p>

      <div className="mt-4 space-y-4">
        {content.sections.map((s, i) => (
          <section key={i} className="rounded-lg border border-line bg-background p-3">
            <h3 className="text-sm font-semibold text-ink">{s.h2}</h3>
            <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-ink">{s.body}</p>
          </section>
        ))}
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
      </fieldset>
    </article>
  );
}
