'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import Image from 'next/image';
import { useRouter } from '@/i18n/navigation';
import { swapAffiliateProduct, removeAffiliateInjection, regenerateAffiliateInsertion } from '@/lib/content/actions';
import { relevanceBand } from '@/lib/research/affiliate';
import { AffiliateProductPicker } from './AffiliateProductPicker';

interface Injection {
  id?: string;
  friendly_code: string;
  url: string;
  post_index: number;
  match_score?: number;
  match_signals?: { category_match?: boolean; keyword_overlap?: number; scored_from_pool_size?: number; fallback_random?: boolean; original_best_score?: number };
  product_name_id?: string;
  product_name_en?: string;
  product_image?: string;
  product_category?: string;
  product_merchant?: string;
}

interface Props {
  draftId: string;
  injection: Injection | null;
  matchScore: number | null;
  hasPlaceholderWarning: boolean;
  regenProviders?: { id: string; slug: string; display_name: string }[];
  regenModels?: { id: string; provider_id: string; model_id: string; display_name: string; priority: number; config: Record<string, unknown> | null }[];
}

const BAND_CLASS: Record<string, string> = {
  high: 'bg-emerald-50 text-emerald-800',
  medium: 'bg-amber-50 text-amber-800',
  low: 'bg-red-50 text-red-800',
  none: 'bg-surface text-ink-muted'
};

export function AffiliateProductCard({ draftId, injection, matchScore, hasPlaceholderWarning, regenProviders = [], regenModels = [] }: Props) {
  const t = useTranslations('content.review.affiliate');
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerMode, setPickerMode] = useState<'regen' | 'swap'>('regen');
  const [busy, setBusy] = useState<'swap' | 'remove' | 'regen' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const band = relevanceBand(matchScore);
  const isFallback = Boolean((injection?.match_signals as Record<string, unknown> | undefined)?.fallback_random);
  const [regenProviderId, setRegenProviderId] = useState('');
  const [regenModelId, setRegenModelId] = useState('');
  const filteredRegenModels = regenProviderId ? regenModels.filter((m) => m.provider_id === regenProviderId) : [];
  async function onSwap(productId: string) {
    setBusy('swap');
    setError(null);
    setPickerOpen(false);
    const result = await swapAffiliateProduct(draftId, productId);
    setBusy(null);
    if (!result.success) setError(result.error ?? 'failed');
    else startTransition(() => router.refresh());
  }

  async function onRegen(productId: string) {
    setBusy('regen');
    setError(null);
    setPickerOpen(false);
    const result = await regenerateAffiliateInsertion(draftId, productId, regenModelId ? { modelId: regenModelId } : undefined);
    setBusy(null);
    if (!result.success) setError(result.error ?? 'failed');
    else {
      setRegenProviderId('');
      setRegenModelId('');
      startTransition(() => router.refresh());
    }
  }

  function handleSelect(productId: string) {
    if (pickerMode === 'swap') onSwap(productId);
    else onRegen(productId);
  }

  async function onRemove() {
    setBusy('remove');
    setError(null);
    const result = await removeAffiliateInjection(draftId);
    setBusy(null);
    if (!result.success) setError(result.error ?? 'failed');
    else startTransition(() => router.refresh());
  }

  return (
    <section className="mt-4 rounded-xl border border-line bg-background p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">{t('title')}</h2>
        <div className="flex items-center gap-2">
          {isFallback ? (
            <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800" title={t('randomBridgeTitle')}>
              {t('randomBadge')}
            </span>
          ) : null}
          {injection ? (
            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${BAND_CLASS[band]}`}>
              {t(`relevance.${band}` as never)} · {matchScore ?? 0}
            </span>
          ) : null}
        </div>
      </div>

      {error ? (
        <p role="alert" className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-800">
          {error}
        </p>
      ) : null}

      {injection ? (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          {injection.product_image ? (
            <Image
              src={injection.product_image}
              alt={injection.product_name_id ?? injection.friendly_code}
              width={64}
              height={64}
              className="size-16 shrink-0 rounded-lg border border-line object-cover"
              loading="lazy"
            />
          ) : null}
          <div className="min-w-0 flex-1">
            {injection.product_name_id ? (
              <p className="text-sm font-medium text-ink">{injection.product_name_id}</p>
            ) : null}
            {injection.product_merchant ? (
              <p className="text-xs text-ink-muted">{injection.product_merchant}</p>
            ) : null}
            <p className="text-xs text-ink-muted">ASH-{injection.friendly_code.replace('ASH-', '')}{injection.product_category ? ` · ${injection.product_category}` : ''}</p>
            <a
              href={injection.url}
              target="_blank"
              rel="noreferrer noopener"
              className="break-words text-xs text-primary underline"
            >
              {t('viewProduct')} ↗
            </a>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => { setPickerMode('regen'); setPickerOpen(true); }}
              disabled={busy !== null}
              aria-busy={busy === 'regen'}
              title={t('reselectRethinkHint')}
              className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy === 'regen' ? '...' : t('reselectRethink')}
            </button>
            <button
              type="button"
              onClick={() => { setPickerMode('swap'); setPickerOpen(true); }}
              disabled={busy !== null}
              aria-busy={busy === 'swap'}
              title={t('swapHint')}
              className="rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-medium text-ink hover:border-primary disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy === 'swap' ? '...' : t('swap')}
            </button>
            <button
              type="button"
              onClick={onRemove}
              disabled={busy !== null}
              aria-busy={busy === 'remove'}
              className="rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-medium text-red-700 hover:border-red-300 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy === 'remove' ? '...' : t('remove')}
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-3 space-y-2">
          <p className="text-sm text-ink-muted">{t('noProduct')}</p>
          <button
            type="button"
            onClick={() => { setPickerMode('regen'); setPickerOpen(true); }}
            disabled={busy !== null}
            aria-busy={busy === 'regen'}
            className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy === 'regen' ? '...' : t('pickAndGenerate')}
          </button>
        </div>
      )}

      {regenProviders.length > 0 ? (
        <div className="mt-3 grid grid-cols-1 gap-2 rounded-lg border border-dashed border-line bg-surface p-3 sm:grid-cols-2">
          <div>
            <label htmlFor="regen-provider" className="block text-[11px] font-medium text-ink-muted">Provider (regen)</label>
            <select id="regen-provider" value={regenProviderId} onChange={(e) => { setRegenProviderId(e.target.value); setRegenModelId(''); }} className="mt-1 block w-full rounded-lg border border-line bg-background px-2 py-1.5 text-xs text-ink">
              <option value="">Default global</option>
              {regenProviders.map((p) => <option key={p.id} value={p.id}>{p.display_name} ({p.slug})</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="regen-model" className="block text-[11px] font-medium text-ink-muted">Model (regen)</label>
            <select id="regen-model" value={regenModelId} onChange={(e) => setRegenModelId(e.target.value)} disabled={!regenProviderId} className="mt-1 block w-full rounded-lg border border-line bg-background px-2 py-1.5 text-xs text-ink disabled:opacity-60">
              <option value="">Default global</option>
              {filteredRegenModels.map((m) => <option key={m.id} value={m.id}>{m.display_name} · {m.model_id}{m.config?.reasoning ? ' · reasoning' : ''}</option>)}
            </select>
          </div>
          <p className="col-span-full text-[11px] text-ink-muted">Kosongkan untuk pakai default Admin → LLM. Jika model pilihan gagal, otomatis fallback ke urutan global dan tercatat di log.</p>
        </div>
      ) : null}

      {isFallback ? (
        <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800" role="status">
          {t('randomBridgeNotice')}
        </p>
      ) : null}

      {hasPlaceholderWarning ? (
        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800" role="status">
          {t('placeholderWarning')}
        </p>
      ) : null}

      {pickerOpen ? (
        <AffiliateProductPicker
          draftId={draftId}
          currentProductId={injection?.id}
          onSelect={handleSelect}
          onClose={() => setPickerOpen(false)}
        />
      ) : null}
    </section>
  );
}
