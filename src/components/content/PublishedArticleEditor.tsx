'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { updatePublishedArticle, archiveArticle } from '@/lib/articles/actions';

export interface PublishedArticleRow {
  id: string;
  locale: string;
  slug: string;
  cover_image_url: string | null;
}

export function PublishedArticleEditor({ articles, draftId }: {
  articles: PublishedArticleRow[];
  draftId: string;
}) {
  const t = useTranslations('content.review');
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [savingOk, setSavingOk] = useState<string | null>(null);
  const [archiving, setArchiving] = useState<string | null>(null);

  const editForm = useState(() => {
    const f: Record<string, { title: string; excerpt: string; slug: string }> = {};
    for (const a of articles) {
      f[a.id] = { title: '', excerpt: '', slug: '' };
    }
    return f;
  });

  // Initialize form fields once when articles change
  const [formData, setFormData] = useState<Record<string, { title: string; excerpt: string; slug: string }>>(() => {
    const init: Record<string, { title: string; excerpt: string; slug: string }> = {};
    for (const a of articles) {
      init[a.id] = { title: a.slug, excerpt: '', slug: a.slug };
    }
    return init;
  });

  function openEdit(articleId: string) {
    const article = articles.find((a) => a.id === articleId);
    if (!article) return;
    setFormData((prev) => ({
      ...prev,
      [articleId]: { title: '', excerpt: '', slug: article.slug }
    }));
    setEditingId(articleId);
    setSavingOk(null);
  }

  async function handleSave(articleId: string) {
    setSaving(articleId);
    setSavingOk(null);
    try {
      const result = await updatePublishedArticle(articleId, {
        slug: formData[articleId]?.slug,
      });
      if (!result.success) {
        alert(result.error ?? 'save failed');
      } else {
        setSavingOk(t('articleSaved'));
        router.refresh();
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(null);
    }
  }

  async function handleArchive(articleId: string) {
    setArchiving(articleId);
    try {
      const result = await archiveArticle(articleId);
      if (!result.success) {
        alert(result.error ?? 'archive failed');
      } else {
        router.refresh();
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setArchiving(null);
    }
  }

  if (articles.length === 0) return null;

  return (
    <div className="mt-4 rounded-xl border border-line bg-surface p-4 shadow-card">
      <h3 className="mb-3 text-sm font-semibold text-ink">{t('articlePublishedList')}</h3>
      <div className="space-y-3">
        {articles.map((art) => (
          <div key={art.id} className="rounded-lg border border-line bg-background p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <span className="chip border border-line bg-surface text-xs">{art.locale}</span>
                <span className="ml-2 text-sm text-ink">/{art.slug}</span>
              </div>
              <div className="flex items-center gap-2">
                {editingId === art.id ? (
                  <>
                    <button
                      type="button"
                      onClick={() => handleSave(art.id)}
                      disabled={saving === art.id}
                      className="btn-primary px-2 py-1 text-xs disabled:opacity-60"
                    >
                      {saving === art.id ? '...' : t('articleSave')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      className="border border-line px-2 py-1 text-xs text-ink hover:bg-background"
                    >
                      {t('articleCancel')}
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => openEdit(art.id)}
                      className="border border-line px-2 py-1 text-xs text-ink hover:bg-background"
                    >
                      {t('articleEdit')}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleArchive(art.id)}
                      disabled={archiving === art.id}
                      className="border border-red-300 px-2 py-1 text-xs text-red-700 hover:bg-red-50 disabled:opacity-60"
                    >
                      {archiving === art.id ? '...' : t('articleArchive')}
                    </button>
                  </>
                )}
              </div>
            </div>
            {editingId === art.id ? (
              <div className="mt-3 space-y-2">
                <input
                  type="text"
                  value={formData[art.id]?.slug ?? ''}
                  onChange={(e) => setFormData((prev) => {
                    const current = prev[art.id] ?? { title: '', excerpt: '', slug: art.slug };
                    return { ...prev, [art.id]: { ...current, slug: e.target.value.toLowerCase() } };
                  })}
                  placeholder="slug"
                  className="w-full rounded-md border border-line bg-surface px-3 py-1.5 text-sm"
                />
                {savingOk === art.id ? (
                  <p className="text-xs text-green-700">{savingOk}</p>
                ) : null}
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
