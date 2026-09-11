'use client';

import { useState, useTransition } from 'react';
import { enhanceImagePrompt, generateDraftImage, listDraftImages, retryFailedImage, selectDraftImage, suggestImagePrompt } from '@/lib/image/actions';
import type { DraftImageRow } from '@/lib/image/types';
import { ImageHistoryCarousel } from './ImageHistoryCarousel';

export interface ImageOption {
  providers: { id: string; slug: string; display_name: string }[];
  models: { id: string; provider_id: string; model_id: string; display_name: string; provider_slug: string }[];
  styles: { slug: string; display_name: string }[];
  subjects: { slug: string; display_name: string }[];
  cameras?: { slug: string; display_name: string }[];
}

interface Props {
  draftId: string;
  initialImages: DraftImageRow[];
  initialSelectedId: string | null;
  options: ImageOption;
  /** True bila dirender di dalam thread (margin ringkas, tanpa mt-6). */
  compact?: boolean;
}

function latestOf(rows: DraftImageRow[]): DraftImageRow | null {
  return [...rows].sort((a, b) => (a.created_at < b.created_at ? 1 : -1))[0] ?? null;
}

export function DraftImageCard({ draftId, initialImages, initialSelectedId, options, compact = false }: Props) {
  const [images, setImages] = useState<DraftImageRow[]>(initialImages);
  const [selectedId, setSelectedId] = useState<string | null>(initialSelectedId);
  const [modelUuid, setModelUuid] = useState('');
  // Rehydrate dari style gambar terakhir agar dropdown mencerminkan yang terpakai.
  const [styleSlug, setStyleSlug] = useState(() => {
    const latest = latestOf(initialImages);
    const slug = latest?.style_slug ?? '';
    return options.styles.some((s) => s.slug === slug) ? slug : '';
  });
  const [promptDraft, setPromptDraft] = useState(() => latestOf(initialImages)?.image_prompt ?? '');
  const [negativeDraft, setNegativeDraft] = useState(() => latestOf(initialImages)?.negative_prompt ?? '');
  // Rehydrate dari kamera gambar terakhir (seperti style) agar dropdown
  // mencerminkan yang terpakai; default kosong = tanpa angle.
  const [cameraSlug, setCameraSlug] = useState(() => {
    const latest = latestOf(initialImages);
    const slug = latest?.camera_slug ?? '';
    return (options.cameras ?? []).some((c) => c.slug === slug) ? slug : '';
  });
  const [proposed, setProposed] = useState<{ prompt: string; negative?: string; reasoning?: { visual_strategy?: string; justification?: string } } | null>(null);
  const [prevPrompt, setPrevPrompt] = useState<{ prompt: string; negative: string } | null>(null);
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [subjectSlug, setSubjectSlug] = useState(() => options.subjects[0]?.slug ?? '');
  const [notice, setNotice] = useState<string | null>(() => {
    const latest = latestOf(initialImages);
    const hasVisual = initialImages.some((i) => (i.status === 'ready' || i.status === 'selected') && i.public_url);
    return latest?.status === 'prompt_ready' && !hasVisual
      ? 'Draf prompt otomatis siap — cek, edit bila perlu, lalu Generate.'
      : null;
  });
  const [isPending, startTransition] = useTransition();

  const hasVisual = images.some((i) => (i.status === 'ready' || i.status === 'selected') && i.public_url);

  function refresh() {
    startTransition(async () => {
      try {
        const rows = await listDraftImages(draftId);
        // Panel ini hanya mengelola cover (post 0); baris per-reply difilter.
        const cover = rows.filter((r) => (r.post_index ?? 0) === 0);
        setImages(cover);
        const sel = cover.find((r) => r.status === 'selected') ?? null;
        setSelectedId(sel?.id ?? null);
        const latest = latestOf(cover);
        if (latest?.image_prompt) setPromptDraft(latest.image_prompt);
        if (latest?.negative_prompt !== undefined) setNegativeDraft(latest.negative_prompt ?? '');
        if (latest?.style_slug && options.styles.some((s) => s.slug === latest.style_slug)) setStyleSlug(latest.style_slug);
        if (latest?.camera_slug && (options.cameras ?? []).some((c) => c.slug === latest.camera_slug)) setCameraSlug(latest.camera_slug);
        const hasVisual = cover.some((i) => (i.status === 'ready' || i.status === 'selected') && i.public_url);
        setNotice(latest?.status === 'prompt_ready' && !hasVisual
          ? 'Draf prompt otomatis siap — cek, edit bila perlu, lalu Generate.'
          : 'Diperbarui.');
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
    setNotice(p ? 'Menyiapkan generate...' : 'Meminta reasoning otomatis...');
    setProposed(null);
    startTransition(async () => {
      try {
        await generateDraftImage(draftId, {
          modelUuid: modelUuid || null,
          styleSlug: styleSlug || null,
          cameraSlug: cameraSlug || null,
          imagePrompt: p || null,
          negativePrompt: n || null
        });
        setNotice(p
          ? 'Masuk antrean generate. Worker cron memproses ≤5 menit — tekan Muat ulang untuk melihat hasil. Prompt edit tersimpan sebagai visual_strategy=custom.'
          : 'Masuk antrean reasoning. Worker menyiapkan draf prompt (tanpa generate) — tekan Muat ulang untuk cek prompt.');
        const rows = await listDraftImages(draftId);
        setImages(rows.filter((r) => (r.post_index ?? 0) === 0));
      } catch (e) {
        setNotice(e instanceof Error ? `Gagal: ${e.message}` : 'Generate gagal.');
      }
    });
  }

  async function handleSuggest() {
    setIsSuggesting(true);
    setNotice('Menyiapkan prompt awal dari postingan…');
    try {
      const res = await suggestImagePrompt(draftId, 0, subjectSlug || null, cameraSlug || null);
      setPromptDraft(res.prompt);
      setProposed(null);
      setNotice(`Prompt awal siap (${res.subjectName}) — cek, edit bila perlu, lalu Sempurnakan.`);
    } catch (e) {
      setNotice(e instanceof Error ? `Gagal: ${e.message}` : 'Siapkan prompt gagal.');
    } finally {
      setIsSuggesting(false);
    }
  }

  async function handleEnhance() {    const p = promptDraft.trim();
    if (!p || p.length < 10) {
      setNotice('Isi image prompt dulu (≥10 karakter) — enhance hanya untuk polish draf yang sudah ada.');
      return;
    }
    setIsEnhancing(true);
    setNotice('Memperhalus prompt...');
    try {
      const res = await enhanceImagePrompt(draftId, 0, p, negativeDraft.trim() || null, styleSlug || null);
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

  function retry(imageId: string) {
    setNotice('Mengulang reasoning…');
    startTransition(async () => {
      try {
        await retryFailedImage(imageId);
        const rows = await listDraftImages(draftId);
        setImages(rows.filter((r) => (r.post_index ?? 0) === 0));
        setNotice('Masuk antrean ulang. Worker cron memproses ≤5 menit — tekan Muat ulang untuk melihat hasil.');
      } catch (e) {
        setNotice(e instanceof Error ? `Gagal: ${e.message}` : 'Ulangi gagal.');
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

      {images.length > 0 ? (
        <div className="mt-3">
          <ImageHistoryCarousel
            rows={images}
            selectedId={selectedId}
            variant="cover"
            isPending={isPending}
            onSelect={select}
            onRetry={retry}
            modelOptions={options.models}
          />
        </div>
      ) : (
        <p className="mt-3 text-sm text-ink-muted">
          Belum ada ilustrasi. Reasoning otomatis menyiapkan draf prompt — cek/edit prompt di bawah lalu Generate.
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
        <label className="text-xs">
          <span className="mb-1 block text-ink-muted">Template subjek (untuk prompt awal)</span>
          <select
            value={subjectSlug}
            onChange={(e) => setSubjectSlug(e.target.value)}
            className="w-full rounded-lg border border-line bg-background px-2 py-1.5 text-sm"
          >
            {options.subjects.map((s) => (
              <option key={s.slug} value={s.slug}>
                {s.display_name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs">
          <span className="mb-1 block text-ink-muted">Camera angle (otomatis ditambah ke prompt)</span>
          <select
            value={cameraSlug}
            onChange={(e) => setCameraSlug(e.target.value)}
            className="w-full rounded-lg border border-line bg-background px-2 py-1.5 text-sm"
          >
            <option value="">(tanpa angle khusus)</option>
            {(options.cameras ?? []).map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.display_name}
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
          onClick={handleSuggest}
          disabled={isPending || isEnhancing || isSuggesting || options.subjects.length === 0}
          aria-busy={isSuggesting}
          className="rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-medium text-ink hover:border-primary disabled:opacity-50"
          title={options.subjects.length === 0 ? 'Belum ada template subjek aktif' : 'Buat draf prompt dari template subjek + isi postingan'}
        >
          {isSuggesting ? 'Menyiapkan…' : 'Siapkan prompt awal'}
        </button>
        <button
          type="button"
          onClick={handleEnhance}
          disabled={isPending || isEnhancing || isSuggesting || !promptDraft.trim() || promptDraft.trim().length < 10}
          className="rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-medium text-ink hover:border-primary disabled:opacity-50"
          title={!promptDraft.trim() ? 'Isi prompt dulu (≥10 karakter)' : 'Polish prompt + negative via LLM'}
        >
          {isEnhancing ? 'Memperhalus...' : 'Sempurnakan'}
        </button>
        <button
          type="button"
          onClick={enqueue}
          disabled={isPending || isEnhancing || isSuggesting}
          className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {isPending ? 'Memproses...' : hasVisual ? 'Regenerate' : 'Generate ilustrasi'}
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

      {notice ? (
        <p role="status" className="mt-3 rounded-lg bg-background px-2 py-1.5 text-xs text-ink-muted">
          {notice}
        </p>
      ) : null}
    </section>
  );
}
