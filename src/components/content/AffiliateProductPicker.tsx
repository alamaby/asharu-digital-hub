'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { createSupabaseBrowser } from '@/lib/supabase/client';

interface Product {
  id: string;
  friendly_code: string;
  name_id: string;
  name_en: string;
  category: string;
  merchant: string;
  url: string;
  image: string;
}

interface Props {
  draftId: string;
  currentProductId?: string;
  onSelect: (productId: string) => void;
  onClose: () => void;
}

export function AffiliateProductPicker({ currentProductId, onSelect, onClose }: Props) {
  const t = useTranslations('content.review.affiliate');
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    const supabase = createSupabaseBrowser();
    if (!supabase) {
      setError('Supabase not configured');
      setLoading(false);
      return;
    }
    supabase
      .from('affiliate_products')
      .select('id, friendly_code, name_id, name_en, category, merchant, url, image')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(20)
      .then(({ data, error }) => {
        if (error) setError(error.message);
        else setProducts((data ?? []) as Product[]);
        setLoading(false);
      });
  }, []);

  const filtered = query.trim()
    ? products.filter((p) => {
        const q = query.toLowerCase();
        return (
          p.name_id.toLowerCase().includes(q) ||
          p.name_en.toLowerCase().includes(q) ||
          p.category.toLowerCase().includes(q) ||
          p.friendly_code.toLowerCase().includes(q)
        );
      })
    : products;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label={t('pickerTitle')}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="max-h-[80vh] w-full max-w-lg overflow-hidden rounded-xl border border-line bg-surface shadow-card">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h3 className="text-sm font-semibold text-ink">{t('pickerTitle')}</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-2 py-1 text-ink-muted hover:bg-background"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        <div className="border-b border-line px-4 py-2">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('pickerSearch')}
            className="w-full rounded-lg border border-line bg-background px-3 py-2 text-sm text-ink focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>
        <div className="max-h-[50vh] overflow-y-auto p-2">
          {loading ? (
            <p className="px-2 py-4 text-center text-sm text-ink-muted">...</p>
          ) : error ? (
            <p className="px-2 py-4 text-center text-sm text-red-700">{error}</p>
          ) : filtered.length === 0 ? (
            <p className="px-2 py-4 text-center text-sm text-ink-muted">{t('pickerEmpty')}</p>
          ) : (
            <ul className="space-y-1">
              {filtered.map((p) => {
                const isCurrent = p.id === currentProductId;
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      disabled={isCurrent}
                      onClick={() => onSelect(p.id)}
                      className="flex w-full items-center gap-3 rounded-lg border border-transparent px-2 py-2 text-left hover:border-primary disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-ink">
                          {p.name_id}
                        </span>
                        <span className="block truncate text-xs text-ink-muted">
                          ASH-{p.friendly_code.replace('ASH-', '')} · {p.category} · {p.merchant}
                        </span>
                      </span>
                      {isCurrent ? (
                        <span className="text-xs text-ink-muted">{t('pickerCurrent')}</span>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
