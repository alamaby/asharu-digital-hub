'use client';

import { useState, useTransition } from 'react';
import { generatePostImage, listDraftImages, selectDraftImage } from '@/lib/image/actions';
import type { DraftImageRow } from '@/lib/image/types';

export interface ReplyImageOption {
  models: { id: string; provider_id: string; model_id: string; display_name: string; provider_slug: string }[];
  styles: { slug: string; display_name: string }[];
}

interface Props {
  draftId: string;
  postIndex: number;
  /** URL selected untuk post ini (bila sudah ada). */
  imageUrl: string | null;
  /** True bila post ini reply afiliasi (pakai gambar produk, generate ditolak). */
  isAffiliate: boolean;
  /** True bila mode per-reply aktif (global/sesi/draf). Cover (0) selalu boleh. */
  perReplyEnabled: boolean;
  options: ReplyImageOption;
}

/** Thumbnail + tombol generate per reply (opt-in, skip afiliasi) di dalam kartu post. */
export function PostImageControl({ draftId, postIndex, imageUrl, isAffiliate, perReplyEnabled, options }: Props) {
  const [notice, setNotice] = useState<string | null>(null);
  const [url, setUrl] = useState<string | null>(imageUrl);
  const [modelUuid, setModelUuid] = useState('');
  const [styleSlug, setStyleSlug] = useState('');
  const [imgBroken, setImgBroken] = useState(false);
  const [isPending, startTransition] = useTransition();

  if (isAffiliate) return null;

  function enqueue() {
    setNotice('Menyiapkan generate…');
    startTransition(async () => {
      try {
        await generatePostImage(draftId, postIndex, {
          modelUuid: modelUuid || null,
          styleSlug: styleSlug || null
        });
        setNotice('Masuk antrean. Worker memproses ≤5 menit — refresh halaman untuk melihat hasil.');
      } catch (e) {
        setNotice(e instanceof Error ? `Gagal: ${e.message}` : 'Generate gagal.');
      }
    });
  }

  async function refreshOne() {
    startTransition(async () => {
      try {
        const rows: DraftImageRow[] = await listDraftImages(draftId);
        const sel = rows.find((r) => (r.post_index ?? 0) === postIndex && r.status === 'selected') ?? null;
        setUrl(sel?.public_url ?? null);
        setImgBroken(false);
        setNotice(sel ? 'Diperbarui.' : 'Belum ada visualisasi untuk post ini.');
      } catch (e) {
        setNotice(e instanceof Error ? `Gagal: ${e.message}` : 'Refresh gagal.');
      }
    });
  }

  async function pickLatestReady() {
    startTransition(async () => {
      try {
        const rows: DraftImageRow[] = await listDraftImages(draftId);
        const ready = rows
          .filter((r) => (r.post_index ?? 0) === postIndex && (r.status === 'ready' || r.status === 'selected') && r.public_url)
          .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))[0];
        if (!ready) {
          setNotice('Belum ada hasil ready — tunggu worker, lalu tekan Muat ulang.');
          return;
        }
        await selectDraftImage(draftId, ready.id);
        setUrl(ready.public_url);
        setImgBroken(false);
        setNotice('Visual dipilih — jadi lampiran social.');
      } catch (e) {
        setNotice(e instanceof Error ? `Gagal: ${e.message}` : 'Pilih gagal.');
      }
    });
  }

  return (
    <div className="mt-2 border-t border-line/60 pt-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium text-ink-muted">Visual balasan</span>
        <button
          type="button"
          onClick={refreshOne}
          disabled={isPending}
          className="text-[11px] text-primary hover:underline disabled:opacity-50"
        >
          {isPending ? 'Memuat…' : 'Muat ulang'}
        </button>
      </div>
      {url && !imgBroken ? (
        <div className="mt-1">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt={`Ilustrasi balasan ${postIndex}`}
            className="max-h-48 w-full rounded-lg object-cover"
            loading="lazy"
            onError={() => setImgBroken(true)}
          />
        </div>
      ) : (
        <p className="mt-1 text-[11px] text-ink-muted">
          {perReplyEnabled || postIndex === 0
            ? 'Belum ada visualisasi untuk post ini.'
            : 'Mode per-reply belum aktif.'}
        </p>
      )}
      {postIndex > 0 && perReplyEnabled ? (
        <div className="mt-1 grid gap-1 sm:grid-cols-2">
          <label className="text-[11px]">
            <span className="mb-0.5 block text-ink-muted">Model (opsional)</span>
            <select
              value={modelUuid}
              onChange={(e) => setModelUuid(e.target.value)}
              className="w-full rounded-md border border-line bg-surface px-1.5 py-1 text-[11px]"
            >
              <option value="">Auto (prioritas waterfall)</option>
              {options.models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.provider_slug} · {m.display_name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-[11px]">
            <span className="mb-0.5 block text-ink-muted">Style (opsional)</span>
            <select
              value={styleSlug}
              onChange={(e) => setStyleSlug(e.target.value)}
              className="w-full rounded-md border border-line bg-surface px-1.5 py-1 text-[11px]"
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
      ) : null}
      {postIndex > 0 && perReplyEnabled ? (
        <div className="mt-1 flex gap-2">
          <button
            type="button"
            onClick={enqueue}
            disabled={isPending}
            className="rounded-md border border-line bg-surface px-2 py-1 text-[11px] font-medium text-ink hover:border-primary disabled:opacity-50"
          >
            {isPending ? 'Memproses…' : url ? 'Regenerate visual' : 'Generate visual'}
          </button>
          <button
            type="button"
            onClick={pickLatestReady}
            disabled={isPending}
            className="rounded-md border border-line bg-surface px-2 py-1 text-[11px] text-ink hover:border-primary disabled:opacity-50"
          >
            Pilih hasil terbaru
          </button>
        </div>
      ) : null}
      {notice ? (
        <p role="status" className="mt-1 text-[11px] text-ink-muted">
          {notice}
        </p>
      ) : null}
    </div>
  );
}
