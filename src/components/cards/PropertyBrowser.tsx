'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { Property, PropertyType, TransactionType } from '@/data/schemas';
import { PropertyCard } from './PropertyCard';
import { EmptyState } from '@/components/ui/EmptyState';

type TransactionFilter = 'all' | TransactionType;
type TypeFilter = 'all' | PropertyType;

interface PropertyBrowserProps {
  properties: Property[];
  linkPosition: string;
}

/** Client-side filter (transaction × type) with a polite live result count. */
export function PropertyBrowser({ properties, linkPosition }: PropertyBrowserProps) {
  const t = useTranslations('propertyFilters');
  const [transaction, setTransaction] = useState<TransactionFilter>('all');
  const [type, setType] = useState<TypeFilter>('all');

  const filtered = useMemo(
    () =>
      properties.filter(
        (property) =>
          (transaction === 'all' || property.transactionType === transaction) &&
          (type === 'all' || property.propertyType === type)
      ),
    [properties, transaction, type]
  );

  const isFiltered = transaction !== 'all' || type !== 'all';

  function reset() {
    setTransaction('all');
    setType('all');
  }

  return (
    <div>
      <fieldset className="border-0 p-0">
        <legend className="sr-only">{t('legend')}</legend>
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <label htmlFor="filter-transaction" className="sr-only">
              {t('transaction')}
            </label>
            <select
              id="filter-transaction"
              value={transaction}
              onChange={(event) => setTransaction(event.target.value as TransactionFilter)}
              className="min-h-touch rounded-lg border border-line bg-surface px-3 text-sm font-medium text-ink"
            >
              <option value="all">{t('allTransactions')}</option>
              <option value="sale">{t('sale')}</option>
              <option value="rent">{t('rent')}</option>
            </select>
          </div>

          <div>
            <label htmlFor="filter-type" className="sr-only">
              {t('type')}
            </label>
            <select
              id="filter-type"
              value={type}
              onChange={(event) => setType(event.target.value as TypeFilter)}
              className="min-h-touch rounded-lg border border-line bg-surface px-3 text-sm font-medium text-ink"
            >
              <option value="all">{t('allTypes')}</option>
              <option value="house">{t('house')}</option>
              <option value="apartment">{t('apartment')}</option>
              <option value="land">{t('land')}</option>
              <option value="shop-house">{t('shop-house')}</option>
            </select>
          </div>

          {isFiltered ? (
            <button
              type="button"
              onClick={reset}
              className="text-sm font-medium text-primary underline underline-offset-4 hover:text-primary-dark"
            >
              {t('reset')}
            </button>
          ) : null}
        </div>
      </fieldset>

      <p role="status" aria-live="polite" className="mt-4 text-sm text-ink-muted">
        {t('resultCount', { count: filtered.length })}
      </p>

      {filtered.length > 0 ? (
        <ul className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((property) => (
            <li key={property.slug} className="h-full">
              <PropertyCard property={property} linkPosition={linkPosition} />
            </li>
          ))}
        </ul>
      ) : (
        <div className="mt-6">
          <EmptyState title={t('emptyTitle')} description={t('emptyDescription')} />
        </div>
      )}
    </div>
  );
}
