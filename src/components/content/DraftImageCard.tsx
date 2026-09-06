'use client';

import { useState, useTransition } from 'react';
import { generateDraftImage, listDraftImages, selectDraftImage } from '@/lib/image/actions';
import type { DraftImageRow } from '@/lib/image/types';

interface ImageOption {
  providers: { id: string; slug: string; display_name: string }[];
  models: { id: string; provider_id: string; model_id: string; display_name: string; provider_slug: string }[];
  styles: { slug: string; display_name: string }[];
}

interface Props {
  draftId: string;
  initialImages: DraftImageRow[];
  initialSelectedId: string | null;
  options: ImageOption;
}

function statusBadge(status: string) {
  const map: Record<string, string> = {
    pending: 'bg-amber-100 text-amber-800',
    ready: 'bg-sky-100 text-sky-800',
    selected: 'bg-emerald-100 text-emerald-800',
    failed: 'bg-red-100 text-red-800'
  };
  return map[status] ?? 'bg-surface text-ink-muted';
}

export function DraftImageCard({ draftId, initialImages, initialSelectedId, options }: Props) {
  const [images, setImages] = useState<DraftImageRow[]>(initialImages);
  const [selectedId, setSelectedId] = useState<string | null>(initialSelectedId);
  const [modelUuid, setModelUuid] = useState('');
  const [styleSlug, setStyleSlug] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const selected = images.find((i) => i.id === selectedId) ?? null;

  function refresh() {
    startTransition(async () => {
      try {
        const rows = await listDraftImages(draftId);
        setImages(rows);
        const sel = rows.find((r) => r.status === 'selected') ?? null;
        setSelectedId(sel?.id ?? null);
        setNotice('Diperbarui.');
      } catch (e) {
        setNotice(e instanceof Error ? e.message : 'Refresh gagal.');
      }
    });
  }

  function enqueue() {
    setNotice('Menyiapkan generate…');
    startTransition(async () => {
      try {
        await generateDraftImage(draftId, {
          modelUuid: modelUuid || null,
          styleSlug: styleSlug || null
        });
        setNotice('Masuk antrean generate. Worker cron memproses ≤5 menit — tekan Muat ulang untuk melihat hasil.');
        const rows = await listDraftImages(draftId);
        setImages(rows);
      } catch (e) {
        setNotice(e instanceof Error ? `Gagal: ${e.message}` : 'Generate gagal.');
      }
    });
  }

  function select(imageId: string) {
    setNotice('Memilih cover…');
    startTransition(async () => {
      try {
        await selectDraftImage(draftId, imageId);
        setSelectedId(imageId);
        const rows = await listDraftImages(draftId);
        setImages(rows);
        setNotice('Cover dipilih — jadi lampiran review & antrean social.');
      } catch (e) {
        setNotice(e instanceof Error ? `Gagal: ${e.message}` : 'Pilih gagal.');
      }
    });
  }

  return (
    <section aria-label="Visualisasi pendukung" className="mt-6 rounded-xl border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Visualisasi pendukung</h2>
        <button
          type="button"
          onClick={refresh}
          disabled={isPending}
          className="text-xs text-primary hover:underline disabled:opacity-50"
        >
          {isPending ? 'Memuat…' : 'Muat ulang'}
        </button>
      </div>

      {selected?.public_url ? (
        <div className="mt-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={selected.public_url}
            alt="Ilustrasi pendukung konten"
            className="max-h-80 w-full rounded-lg object-cover"
            loading="lazy"
          />
          <p className="mt-2 text-xs text-ink-muted">
            {selected.provider_slug} · {selected.model_id}
            {selected.style_slug ? ` · ${selected.style_slug}` : ''}
          </p>
        </div>
      ) : (
        <p className="mt-3 text-sm text-ink-muted">
          Belum ada ilustrasi. Generate otomatis berjalan via worker, atau picu manual di bawah.
        </p>
      )}

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <label className="text-xs">
          <span className="mb-1 block text-ink-muted">Provider / model (opsional override)</span>
          <select
            value={modelUuid}
            onChange={(e) => setModelUuid(e.target.value)}
            className="w-full rounded-lg border border-line bg-background px-2 py-1.5 text-sm"
          >
            <option value="">Auto (prioritas waterfall)</option>
            {options.models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.provider_slug} · {m.display_name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs">
          <span className="mb-1 block text-ink-muted">Style (opsional override)</span>
          <select
            value={styleSlug}
            onChange={(e) => setStyleSlug(e.target.value)}
            className="w-full rounded-lg border border-line bg-background px-2 py-1.5 text-sm"
          >
            <option value="">Auto (default global)</option>
            {options.styles.map((s) => (
              <option key={s.slug} value={s.slug}>
                {s.display_name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="mt-2">
        <button
          type="button"
          onClick={enqueue}
          disabled={isPending}
          className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {isPending ? 'Memproses…' : images.length > 0 ? 'Regenerate' : 'Generate ilustrasi'}
        </button>
      </div>

      {images.length > 0 ? (
        <ul className="mt-4 space-y-2">
          {images.map((img) => (
            <li key={img.id} className="flex items-start justify-between gap-2 rounded-lg border border-line p-2 text-xs">
              <div className="min-w-0">
                <span className={`inline-block rounded px-1.5 py-0.5 font-medium ${statusBadge(img.status)}`}>
                  {img.status}
                </span>{' '}
                <span className="text-ink-muted">
                  {img.provider_slug || 'auto'} · {img.model_id || 'auto'}
                  {img.style_slug ? ` · ${img.style_slug}` : ''}
                </span>
                <p className="mt-1 line-clamp-2 text-ink">{img.image_prompt || 'Menunggu worker…'}</p>
                {img.status === 'failed' && img.last_error ? (
                  <p className="mt-1 text-red-700">Error: {img.last_error}</p>
                ) : null}
              </div>
              <div className="flex shrink-0 gap-2">
                {img.public_url ? (
                  <a href={img.public_url} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                    Lihat
                  </a>
                ) : null}
                {img.status === 'ready' && img.id !== selectedId ? (
                  <button
                    type="button"
                    onClick={() => select(img.id)}
                    disabled={isPending}
                    className="text-primary hover:underline disabled:opacity-50"
                  >
                    Pilih
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {notice ? (
        <p role="status" className="mt-3 rounded-lg bg-background px-2 py-1.5 text-xs text-ink-muted">
          {notice}
        </p>
      ) : null}
    </section>
  );
}
