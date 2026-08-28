'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Inbox } from 'lucide-react';
import type { AffiliateProduct, ProductCategory } from '@/data/schemas';
import { ProductCard } from './ProductCard';

const PAGE_SIZE = 8;

interface ProductBrowserProps {
  products: AffiliateProduct[];
  linkPosition?: string;
}

/**
 * Category-filter chips + load-more pagination. The "Muat 8 lagi" button reveals
 * the next PAGE_SIZE items from the filtered set; filtering does not change
 * the cumulative counter, so a user can narrow to a category and still page
 * through what is there. Available categories are derived from the dataset,
 * not from the enum, so newly added categories show up automatically.
 */
export function ProductBrowser({ products, linkPosition = 'products-grid' }: ProductBrowserProps) {
  const t = useTranslations('product.filters');
  const tCategory = useTranslations('categories');

  const availableCategories = useMemo(
    () => Array.from(new Set(products.map((p) => p.category))) as ProductCategory[],
    [products]
  );

  const [selected, setSelected] = useState<Set<ProductCategory>>(
    () => new Set(availableCategories)
  );
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  // Drop selections that are no longer present when the dataset changes.
  useEffect(() => {
    if (selected.size === 0) return;
    const allowed = new Set(availableCategories);
    setSelected((prev) => {
      let changed = false;
      const next = new Set<ProductCategory>();
      for (const cat of prev) {
        if (allowed.has(cat)) next.add(cat);
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [availableCategories, selected]);

  const isAllSelected =
    selected.size === availableCategories.length && availableCategories.length > 0;

  const filtered = useMemo(
    () =>
      isAllSelected
        ? products
        : products.filter((p) => selected.has(p.category)),
    [products, isAllSelected, selected]
  );

  const visible = filtered.slice(0, visibleCount);
  const canLoadMore = visibleCount < filtered.length;
  const isFiltered = !isAllSelected;

  function toggleCategory(category: ProductCategory) {
    setVisibleCount(PAGE_SIZE);
    if (isAllSelected) {
      // Narrowing from the "all" state to a single category is the most
      // intuitive first interaction; otherwise pure toggle.
      setSelected(new Set([category]));
      return;
    }
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  }

  function selectAll() {
    setVisibleCount(PAGE_SIZE);
    setSelected(new Set(availableCategories));
  }

  function loadMore() {
    setVisibleCount((value) => Math.min(value + PAGE_SIZE, filtered.length));
  }

  function reset() {
    setVisibleCount(PAGE_SIZE);
    setSelected(new Set(availableCategories));
  }

  return (
    <div>
      <fieldset className="border-0 p-0">
        <legend className="sr-only">{t('legend')}</legend>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={selectAll}
            aria-pressed={isAllSelected}
            className={
              isAllSelected
                ? 'chip border border-primary bg-primary/10 text-primary'
                : 'chip border border-line bg-surface text-ink hover:border-primary hover:text-primary'
            }
          >
            {t('all')}
          </button>
          {availableCategories.map((category) => {
            const isActive = selected.has(category);
            return (
              <button
                key={category}
                type="button"
                onClick={() => toggleCategory(category)}
                aria-pressed={isActive}
                className={
                  isActive
                    ? 'chip border border-primary bg-primary/10 text-primary'
                    : 'chip border border-line bg-surface text-ink hover:border-primary hover:text-primary'
                }
              >
                {tCategory(category)}
              </button>
            );
          })}

          {isFiltered ? (
            <button
              type="button"
              onClick={reset}
              className="ml-1 text-sm font-medium text-primary underline underline-offset-4 hover:text-primary-dark"
            >
              {t('reset')}
            </button>
          ) : null}
        </div>
      </fieldset>

      <p
        role="status"
        aria-live="polite"
        data-testid="product-result-count"
        className="mt-4 text-sm text-ink-muted"
      >
        {t('resultCount', { visible: visible.length, total: filtered.length })}
      </p>

      {filtered.length > 0 ? (
        <>
          <ul
            className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
            data-testid="product-grid"
          >
            {visible.map((product) => (
              <li key={product.id} className="h-full">
                <ProductCard product={product} linkPosition={linkPosition} />
              </li>
            ))}
          </ul>

          {canLoadMore ? (
            <div className="mt-8 flex justify-center">
              <button
                type="button"
                onClick={loadMore}
                className="btn-secondary"
              >
                {t('loadMore')}
              </button>
            </div>
          ) : null}
        </>
      ) : (
        <div className="mt-6 flex flex-col items-center gap-2 rounded-xl border border-dashed border-line bg-surface px-6 py-12 text-center">
          <Inbox className="size-8 text-ink-muted" aria-hidden />
          <p className="text-base font-semibold text-ink">{t('emptyTitle')}</p>
          <p className="max-w-md text-sm text-ink-muted">{t('emptyDescription')}</p>
        </div>
      )}
    </div>
  );
}