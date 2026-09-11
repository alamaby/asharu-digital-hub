'use client';

import { useState, useTransition } from 'react';
import { enhanceImagePrompt, generatePostImage, listDraftImages, retryFailedImage, selectDraftImage, suggestImagePrompt } from '@/lib/image/actions';
import type { DraftImageRow } from '@/lib/image/types';
import { ImageHistoryCarousel } from './ImageHistoryCarousel';

export interface ReplyImageOption {
  models: { id: string; provider_id: string; model_id: string; display_name: string; provider_slug: string }[];
  styles: { slug: string; display_name: string }[];
  subjects: { slug: string; display_name: string }[];
  cameras?: { slug: string; display_name: string }[];
}

interface Props {
  draftId: string;
  postIndex: number;
  /** Riwayat gambar post ini (terbaru dulu) — carousel menampilkan semuanya. */
  initialHistory: DraftImageRow[];
  /** True bila post ini reply afiliasi (pakai gambar produk, generate ditolak). */
  isAffiliate: boolean;
  /** True bila mode per-reply aktif (global/sesi/draf). Cover (0) selalu boleh. */
  perReplyEnabled: boolean;
  options: ReplyImageOption;
}

/** Carousel riwayat + tombol generate per reply (opt-in, skip afiliasi) di dalam kartu post. */
export function PostImageControl({ draftId, postIndex, initialHistory, isAffiliate, perReplyEnabled, options }: Props) {
  const [notice, setNotice] = useState<string | null>(null);
  const [history, setHistory] = useState<DraftImageRow[]>(initialHistory);
  const [modelUuid, setModelUuid] = useState('');
  const [styleSlug, setStyleSlug] = useState('');
  const [promptDraft, setPromptDraft] = useState('');
  const [negativeDraft, setNegativeDraft] = useState('');
  const [proposed, setProposed] = useState<{ prompt: string; negative?: string; reasoning?: { visual_strategy?: string; justification?: string } } | null>(null);
  const [prevPrompt, setPrevPrompt] = useState<{ prompt: string; negative: string } | null>(null);
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [subjectSlug, setSubjectSlug] = useState(() => options.subjects[0]?.slug ?? '');
  const [cameraSlug, setCameraSlug] = useState('');
  const [isPending, startTransition] = useTransition();

  const selected = history.find((r) => r.status === 'selected') ?? null;
  const hasVisual = history.some((i) => (i.status === 'ready' || i.status === 'selected') && i.public_url);

  if (isAffiliate) return null;

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
        await generatePostImage(draftId, postIndex, {
          modelUuid: modelUuid || null,
          styleSlug: styleSlug || null,
          cameraSlug: cameraSlug || null,
          imagePrompt: p || null,
          negativePrompt: n || null
        });
        setNotice(p
          ? 'Masuk antrean. Worker memproses ≤5 menit — refresh halaman untuk melihat hasil. Prompt edit custom.'
          : 'Masuk antrean reasoning. Worker menyiapkan draf prompt (tanpa generate) — refresh untuk cek prompt.');
      } catch (e) {
        setNotice(e instanceof Error ? `Gagal: ${e.message}` : 'Generate gagal.');
      }
    });
  }

  async function handleSuggest() {
    setIsSuggesting(true);
    setNotice('Menyiapkan prompt awal dari balasan…');
    try {
      const res = await suggestImagePrompt(draftId, postIndex, subjectSlug || null, cameraSlug || null);
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
      const res = await enhanceImagePrompt(draftId, postIndex, p, negativeDraft.trim() || null, styleSlug || null);
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

  function fetchHistoryAndSync(): Promise<DraftImageRow[]> {
    return listDraftImages(draftId).then((rows) => {
      const mine = rows.filter((r) => (r.post_index ?? 0) === postIndex);
      setHistory(mine);
      return mine;
    });
  }

  async function refreshOne() {
    startTransition(async () => {
      try {
        const mine = await fetchHistoryAndSync();
        const latest = mine[0] ?? null;
        if (latest?.image_prompt) setPromptDraft(latest.image_prompt);
        if (latest?.negative_prompt !== undefined) setNegativeDraft(latest.negative_prompt ?? '');
        if (latest?.style_slug && options.styles.some((s) => s.slug === latest.style_slug)) setStyleSlug(latest.style_slug);
        if (latest?.camera_slug && (options.cameras ?? []).some((c) => c.slug === latest.camera_slug)) setCameraSlug(latest.camera_slug);
        setNotice(latest?.status === 'selected' || latest?.status === 'ready'
          ? 'Diperbarui.'
          : latest?.status === 'prompt_ready'
            ? 'Draf prompt otomatis siap — cek, edit bila perlu, lalu Generate.'
            : 'Belum ada visualisasi untuk post ini.');
      } catch (e) {
        setNotice(e instanceof Error ? `Gagal: ${e.message}` : 'Refresh gagal.');
      }
    });
  }

  function pickLatestReady() {
    startTransition(async () => {
      try {
        const ready = history
          .filter((r) => (r.status === 'ready' || r.status === 'selected') && r.public_url)[0] ?? null;
        if (!ready) {
          setNotice('Belum ada hasil ready — tunggu worker, lalu tekan Muat ulang.');
          return;
        }
        await selectDraftImage(draftId, ready.id);
        await fetchHistoryAndSync();
        setNotice('Visual dipilih — jadi lampiran social.');
      } catch (e) {
        setNotice(e instanceof Error ? `Gagal: ${e.message}` : 'Pilih gagal.');
      }
    });
  }

  function select(imageId: string) {
    setNotice('Memilih visual...');
    startTransition(async () => {
      try {
        await selectDraftImage(draftId, imageId);
        await fetchHistoryAndSync();
        setNotice('Visual dipilih — jadi lampiran social.');
      } catch (e) {
        setNotice(e instanceof Error ? `Gagal: ${e.message}` : 'Pilih gagal.');
      }
    });
  }

  function retryOne(imageId: string) {
    setNotice('Mengulang reasoning...');
    startTransition(async () => {
      try {
        await retryFailedImage(imageId);
        await fetchHistoryAndSync();
        setNotice('Masuk antrean ulang. Worker cron memproses ≤5 menit — tekan Muat ulang untuk melihat hasil.');
      } catch (e) {
        setNotice(e instanceof Error ? `Gagal: ${e.message}` : 'Ulangi gagal.');
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
      {history.length > 0 ? (
        <div className="mt-1">
          <ImageHistoryCarousel
            rows={history}
            selectedId={selected?.id ?? null}
            variant="reply"
            isPending={isPending}
            onSelect={select}
            onRetry={retryOne}
            modelOptions={options.models}
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
        <div className="mt-1 grid gap-1">
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
          <label className="text-[11px]">
            <span className="mb-0.5 block text-ink-muted">Template subjek</span>
            <select
              value={subjectSlug}
              onChange={(e) => setSubjectSlug(e.target.value)}
              className="w-full rounded-md border border-line bg-surface px-1.5 py-1 text-[11px]"
            >
              {options.subjects.map((s) => (
                <option key={s.slug} value={s.slug}>
                  {s.display_name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-[11px]">
            <span className="mb-0.5 block text-ink-muted">Camera angle (auto ke prompt)</span>
            <select
              value={cameraSlug}
              onChange={(e) => setCameraSlug(e.target.value)}
              className="w-full rounded-md border border-line bg-surface px-1.5 py-1 text-[11px]"
            >
              <option value="">(tanpa angle khusus)</option>
              {(options.cameras ?? []).map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.display_name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-[11px]">
            <span className="mb-0.5 block text-ink-muted">Image prompt (EN, ≤500 — edit lalu Regenerate)</span>
            <textarea
              value={promptDraft}
              onChange={(e) => setPromptDraft(e.target.value)}
              maxLength={500}
              rows={2}
              placeholder="Contoh: tidy bedroom after declutter, soft light..."
              className="w-full rounded-md border border-line bg-surface px-1.5 py-1 text-[11px]"
            />
            <span className="text-[10px] text-ink-muted">{promptDraft.length}/500</span>
          </label>
          <label className="text-[11px]">
            <span className="mb-0.5 block text-ink-muted">Negative prompt (opsional, ≤300)</span>
            <textarea
              value={negativeDraft}
              onChange={(e) => setNegativeDraft(e.target.value)}
              maxLength={300}
              rows={1}
              placeholder="blurry, low quality"
              className="w-full rounded-md border border-line bg-surface px-1.5 py-1 text-[11px]"
            />
            <span className="text-[10px] text-ink-muted">{negativeDraft.length}/300</span>
          </label>
        </div>
      ) : null}
      {postIndex > 0 && perReplyEnabled ? (
        <div className="mt-1 flex flex-wrap gap-1">
          <button
            type="button"
            onClick={handleSuggest}
            disabled={isPending || isEnhancing || isSuggesting || options.subjects.length === 0}
            aria-busy={isSuggesting}
            className="rounded-md border border-line bg-surface px-2 py-1 text-[11px] font-medium text-ink hover:border-primary disabled:opacity-50"
            title={options.subjects.length === 0 ? 'Belum ada template subjek aktif' : 'Buat draf prompt dari template + isi balasan'}
          >
            {isSuggesting ? 'Menyiapkan…' : 'Siapkan prompt awal'}
          </button>
          <button
            type="button"
            onClick={handleEnhance}
            disabled={isPending || isEnhancing || isSuggesting || !promptDraft.trim() || promptDraft.trim().length < 10}
            className="rounded-md border border-line bg-surface px-2 py-1 text-[11px] font-medium text-ink hover:border-primary disabled:opacity-50"
            title={!promptDraft.trim() ? 'Isi prompt dulu (≥10 karakter)' : 'Polish prompt + negative via LLM'}
          >
            {isEnhancing ? 'Memperhalus...' : 'Sempurnakan'}
          </button>
          <button
            type="button"
            onClick={enqueue}
            disabled={isPending || isEnhancing || isSuggesting}
            className="rounded-md border border-line bg-surface px-2 py-1 text-[11px] font-medium text-ink hover:border-primary disabled:opacity-50"
          >
            {isPending ? 'Memproses...' : hasVisual ? 'Regenerate visual' : 'Generate visual'}
          </button>
          <button
            type="button"
            onClick={pickLatestReady}
            disabled={isPending || isEnhancing || isSuggesting}
            className="rounded-md border border-line bg-surface px-2 py-1 text-[11px] text-ink hover:border-primary disabled:opacity-50"
          >
            Pilih hasil terbaru
          </button>
        </div>
      ) : null}
      {proposed ? (
        <div className="mt-1 rounded-md border border-amber-300 bg-amber-50/40 p-2 text-[11px]">
          <p className="font-semibold text-amber-900">Side-by-side usulan</p>
          <div className="mt-1 grid gap-2 md:grid-cols-2">
            <div className="rounded border border-line bg-surface p-1.5">
              <p className="text-[10px] font-semibold text-ink-muted">Draf Anda</p>
              <p className="mt-0.5 text-ink">{promptDraft || '—'}</p>
              <p className="mt-1 text-ink-muted">Negative: {negativeDraft || '—'}</p>
            </div>
            <div className="rounded border border-primary/30 bg-primary/10 p-1.5">
              <p className="text-[10px] font-semibold text-primary">Usulan LLM</p>
              <p className="mt-0.5 text-ink">{proposed.prompt}</p>
              <p className="mt-1 text-ink-muted">Negative: {proposed.negative || '—'}</p>
              {proposed.reasoning ? (
                <p className="mt-1 text-ink-muted">
                  Strategi: {proposed.reasoning.visual_strategy}
                  {proposed.reasoning.justification ? ` — ${proposed.reasoning.justification}` : ''}
                </p>
              ) : null}
            </div>
          </div>
          <div className="mt-1 flex gap-1">
            <button type="button" onClick={acceptProposed} className="rounded bg-primary px-2 py-1 text-[11px] font-medium text-white">
              Terima
            </button>
            <button type="button" onClick={() => setProposed(null)} className="rounded border border-line bg-surface px-2 py-1 text-[11px]">
              Batal
            </button>
            {prevPrompt ? (
              <button type="button" onClick={() => { setPromptDraft(prevPrompt.prompt); setNegativeDraft(prevPrompt.negative); setPrevPrompt(null); setNotice('Dikembalikan ke draf sebelumnya.'); }} className="text-[11px] text-ink-muted hover:text-primary">
                Urungkan
              </button>
            ) : null}
          </div>
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
