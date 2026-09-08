'use client';

import { useState, useTransition } from 'react';
import { enhanceImagePrompt, generateDraftImage, listDraftImages, selectDraftImage } from '@/lib/image/actions';
import type { DraftImageRow } from '@/lib/image/types';

export interface ImageOption {
  providers: { id: string; slug: string; display_name: string }[];
  models: { id: string; provider_id: string; model_id: string; display_name: string; provider_slug: string }[];
  styles: { slug: string; display_name: string }[];
}

interface Props {
  draftId: string;
  initialImages: DraftImageRow[];
  initialSelectedId: string | null;
  options: ImageOption;
  /** True bila dirender di dalam thread (margin ringkas, tanpa mt-6). */
  compact?: boolean;
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

export function DraftImageCard({ draftId, initialImages, initialSelectedId, options, compact = false }: Props) {
  const [images, setImages] = useState<DraftImageRow[]>(initialImages);
  const [selectedId, setSelectedId] = useState<string | null>(initialSelectedId);
  const [modelUuid, setModelUuid] = useState('');
  const [styleSlug, setStyleSlug] = useState('');
  const [promptDraft, setPromptDraft] = useState('');
  const [negativeDraft, setNegativeDraft] = useState('');
  const [proposed, setProposed] = useState<{ prompt: string; negative?: string; reasoning?: { visual_strategy?: string; justification?: string } } | null>(null);
  const [prevPrompt, setPrevPrompt] = useState<{ prompt: string; negative: string } | null>(null);
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const selected = images.find((i) => i.id === selectedId) ?? null;

  function refresh() {
    startTransition(async () => {
      try {
        const rows = await listDraftImages(draftId);
        // Panel ini hanya mengelola cover (post 0); baris per-reply difilter.
        const cover = rows.filter((r) => (r.post_index ?? 0) === 0);
        setImages(cover);
        const sel = cover.find((r) => r.status === 'selected') ?? null;
        setSelectedId(sel?.id ?? null);
        const latest = [...cover].sort((a, b) => (a.created_at < b.created_at ? 1 : -1))[0] ?? null;
        if (latest?.image_prompt) setPromptDraft(latest.image_prompt);
        if (latest?.negative_prompt !== undefined) setNegativeDraft(latest.negative_prompt ?? '');
        setNotice('Diperbarui.');
      } catch (e) {
        setNotice(e instanceof Error ? e.message : 'Refresh gagal.');
      }
    });
  }

  function enqueue() {
    const p = promptDraft.trim();
    const n = negativeDraft.trim();
    if (p && p.length < 10) {
      setNotice('Prompt minimal 10 karakter (EN, ≤60 kata, akan ditambah style suffix).');
      return;
    }
    setNotice('Menyiapkan generate...');
    setProposed(null);
    startTransition(async () => {
      try {
        await generateDraftImage(draftId, {
          modelUuid: modelUuid || null,
          styleSlug: styleSlug || null,
          imagePrompt: p || null,
          negativePrompt: n || null
        });
        setNotice('Masuk antrean generate. Worker cron memproses ≤5 menit — tekan Muat ulang untuk melihat hasil. Prompt edit tersimpan sebagai visual_strategy=custom.');
        const rows = await listDraftImages(draftId);
        setImages(rows.filter((r) => (r.post_index ?? 0) === 0));
      } catch (e) {
        setNotice(e instanceof Error ? `Gagal: ${e.message}` : 'Generate gagal.');
      }
    });
  }

  async function handleEnhance() {
    const p = promptDraft.trim();
    if (!p || p.length < 10) {
      setNotice('Isi image prompt dulu (≥10 karakter) — enhance hanya untuk polish draf yang sudah ada.');
      return;
    }
    setIsEnhancing(true);
    setNotice('Memperhalus prompt...');
    try {
      const res = await enhanceImagePrompt(draftId, 0, p, negativeDraft.trim() || null);
      setProposed({ prompt: res.image_prompt, negative: res.negative_prompt, reasoning: res.reasoning });
      setNotice('Usulan siap — cek side-by-side, lalu Terima atau Batal.');
    } catch (e) {
      setNotice(e instanceof Error ? `Gagal enhance: ${e.message}` : 'Enhance gagal.');
    } finally {
      setIsEnhancing(false);
    }
  }

  function acceptProposed() {
    if (!proposed) return;
    setPrevPrompt({ prompt: promptDraft, negative: negativeDraft });
    setPromptDraft(proposed.prompt);
    setNegativeDraft(proposed.negative ?? '');
    setNotice('Usulan diterima — cek prompt, lalu Regenerate bila siap.');
    setProposed(null);
  }

  function select(imageId: string) {
    setNotice('Memilih cover…');
    startTransition(async () => {
      try {
        await selectDraftImage(draftId, imageId);
        setSelectedId(imageId);
        const rows = await listDraftImages(draftId);
        setImages(rows.filter((r) => (r.post_index ?? 0) === 0));
        setNotice('Cover dipilih — jadi lampiran review & antrean social.');
      } catch (e) {
        setNotice(e instanceof Error ? `Gagal: ${e.message}` : 'Pilih gagal.');
      }
    });
  }

  return (
    <section aria-label="Visualisasi pendukung" className={`${compact ? 'mt-4' : 'mt-6'} rounded-xl border border-line bg-surface p-4`}>
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
      <div className="mt-3 grid gap-2">
        <label className="text-xs">
          <span className="mb-1 block text-ink-muted">Image prompt (EN, ≤500 char / ≤60 kata — edit lalu Regenerate; style suffix ditambah otomatis)</span>
          <textarea
            value={promptDraft}
            onChange={(e) => setPromptDraft(e.target.value)}
            maxLength={500}
            rows={3}
            placeholder="Contoh: cozy minimalist bedroom before organizing, warm light..."
            className="w-full rounded-lg border border-line bg-background px-2 py-1.5 text-sm"
          />
          <span className="text-[11px] text-ink-muted">{promptDraft.length}/500{promptDraft ? ` · ${promptDraft.split(/\s+/).filter(Boolean).length} kata` : ''}</span>
        </label>
        <label className="text-xs">
          <span className="mb-1 block text-ink-muted">Negative prompt (opsional, ≤300 char)</span>
          <textarea
            value={negativeDraft}
            onChange={(e) => setNegativeDraft(e.target.value)}
            maxLength={300}
            rows={2}
            placeholder="Contoh: blurry, low quality"
            className="w-full rounded-lg border border-line bg-background px-2 py-1.5 text-sm"
          />
          <span className="text-[11px] text-ink-muted">{negativeDraft.length}/300</span>
        </label>
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={handleEnhance}
          disabled={isPending || isEnhancing || !promptDraft.trim() || promptDraft.trim().length < 10}
          className="rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-medium text-ink hover:border-primary disabled:opacity-50"
          title={!promptDraft.trim() ? 'Isi prompt dulu (≥10 karakter)' : 'Polish prompt + negative via LLM'}
        >
          {isEnhancing ? 'Memperhalus...' : 'Sempurnakan'}
        </button>
        <button
          type="button"
          onClick={enqueue}
          disabled={isPending || isEnhancing}
          className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {isPending ? 'Memproses...' : images.length > 0 ? 'Regenerate' : 'Generate ilustrasi'}
        </button>
        <span className="ml-2 text-[11px] text-ink-muted">Sempurnakan = side-by-side (prompt+negative) → Terima/Batal → Regenerate.</span>
      </div>

      {proposed ? (
        <div className="mt-3 rounded-xl border border-amber-300 bg-amber-50/40 p-3 text-xs">
          <p className="font-semibold text-amber-900">Side-by-side — usulan LLM</p>
          <div className="mt-2 grid gap-3 md:grid-cols-2">
            <div className="rounded-lg border border-line bg-surface p-2">
              <p className="text-[11px] font-semibold text-ink-muted">Draf Anda</p>
              <p className="mt-1 text-ink">{promptDraft || '—'}</p>
              <p className="mt-2 text-ink-muted">Negative: {negativeDraft || '—'}</p>
            </div>
            <div className="rounded-lg border border-primary/30 bg-primary/10 p-2">
              <p className="text-[11px] font-semibold text-primary">Usulan LLM</p>
              <p className="mt-1 text-ink">{proposed.prompt}</p>
              <p className="mt-2 text-ink-muted">Negative: {proposed.negative || '—'}</p>
              {proposed.reasoning ? (
                <p className="mt-1 text-ink-muted">
                  Strategi: {proposed.reasoning.visual_strategy}
                  {proposed.reasoning.justification ? ` — ${proposed.reasoning.justification}` : ''}
                </p>
              ) : null}
            </div>
          </div>
          <div className="mt-2 flex gap-2">
            <button type="button" onClick={acceptProposed} className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white">
              Terima
            </button>
            <button type="button" onClick={() => setProposed(null)} className="rounded-lg border border-line bg-surface px-3 py-1.5 text-xs">
              Batal
            </button>
            {prevPrompt ? (
              <button
                type="button"
                onClick={() => { setPromptDraft(prevPrompt.prompt); setNegativeDraft(prevPrompt.negative); setPrevPrompt(null); setNotice('Dikembalikan ke draf sebelumnya.'); }}
                className="text-xs text-ink-muted hover:text-primary"
              >
                Urungkan
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

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
                {(img as { negative_prompt?: string | null }).negative_prompt ? (
                  <p className="mt-1 text-ink-muted">Negative: {(img as { negative_prompt?: string | null }).negative_prompt}</p>
                ) : null}
                {img.reasoning?.visual_strategy ? (
                  <p className="mt-1 text-ink-muted">
                    Strategi: {img.reasoning.visual_strategy}
                    {img.reasoning.hook_keywords?.length ? ` · hook: ${img.reasoning.hook_keywords.join(', ')}` : ''}
                    {img.reasoning.justification ? ` — ${img.reasoning.justification}` : ''}
                  </p>
                ) : null}
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
