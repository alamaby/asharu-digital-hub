'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { enhanceImagePrompt, generateDraftImage, listDraftImages, retryFailedImage, selectDraftImage, suggestImagePrompt, uploadDraftCoverImage, uploadDraftImageReference } from '@/lib/image/actions';
import type { DraftImageRow } from '@/lib/image/types';
import { ImageHistoryCarousel } from './ImageHistoryCarousel';
import { ReferencePicker, type ReferenceModelOption } from './ReferencePicker';

export interface ImageOption {
  providers: { id: string; slug: string; display_name: string }[];
  models: ReferenceModelOption[];
  styles: { slug: string; display_name: string }[];
  subjects: { slug: string; display_name: string }[];
  cameras?: { slug: string; display_name: string }[];
}

/** Opsi model LLM (stage default atau pin user) untuk panel Sempurnakan. */
export interface LlmModelOption {
  id: string;
  model_id: string;
  display_name: string;
}

interface Props {
  draftId: string;
  initialImages: DraftImageRow[];
  initialSelectedId: string | null;
  options: ImageOption;
  /** True bila dirender di dalam thread (margin ringkas, tanpa mt-6). */
  compact?: boolean;
  /** Locale + timezone zona-user untuk timeline carousel. */
  locale?: string | null;
  timeZone?: string | null;
  /** Model LLM aktif untuk picker Sempurnakan (kosong = Auto default stage). */
  llmModels?: LlmModelOption[];
  /** Default collapsed saat first render (default false = terbuka untuk cover). */
  defaultCollapsed?: boolean;
}

function latestOf(rows: DraftImageRow[]): DraftImageRow | null {
  return [...rows].sort((a, b) => (a.created_at < b.created_at ? 1 : -1))[0] ?? null;
}

export function DraftImageCard({ draftId, initialImages, initialSelectedId, options, compact = false, locale = null, timeZone = null, llmModels = [], defaultCollapsed = false }: Props) {
  const t = useTranslations('content.review');
  const [images, setImages] = useState<DraftImageRow[]>(initialImages);
  const [selectedId, setSelectedId] = useState<string | null>(initialSelectedId);
  const [modelUuid, setModelUuid] = useState('');
  // Auto-enhance default ON untuk cover (hemat ketik manual), bucket shared dengan Sempurnakan.
  const [autoEnhance, setAutoEnhance] = useState(true);
  // Picker model LLM untuk Sempurnakan: null/Auto = stage default, UUID = pin.
  const [llmModelUuid, setLlmModelUuid] = useState('');
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
  const [proposed, setProposed] = useState<{ prompt: string; negative?: string; reasoning?: { visual_strategy?: string; justification?: string }; styleSlug?: string | null; subjectSlug?: string | null; cameraSlug?: string | null } | null>(null);
  const [prevPrompt, setPrevPrompt] = useState<{ prompt: string; negative: string; styleSlug: string | null; subjectSlug: string | null; cameraSlug: string | null } | null>(null);
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [subjectSlug, setSubjectSlug] = useState(() => '');
  // Referensi img2img cover: URL aktif + strength + notice upload.
  const [referenceUrl, setReferenceUrl] = useState<string | null>(() => latestOf(initialImages)?.reference_public_url ?? null);
  const [referenceStrength, setReferenceStrength] = useState<number>(() => {
    const s = Number(latestOf(initialImages)?.reference_strength);
    return Number.isFinite(s) && s >= 0 && s <= 1 ? s : 0.6;
  });
  // Advanced (opsional): kosong = Auto (hemat, clamp ≤1024px/≤25 steps); pin model = HD.
  const advOf = (v: string | number | null | undefined): string => {
    if (v === null || v === undefined || v === '') return '';
    const n = Number(v);
    return Number.isFinite(n) ? String(n) : '';
  };
  const [advGuidance, setAdvGuidance] = useState(() => advOf(latestOf(initialImages)?.guidance));
  const [advSteps, setAdvSteps] = useState(() => advOf(latestOf(initialImages)?.steps));
  const [advSeed, setAdvSeed] = useState(() => advOf(latestOf(initialImages)?.seed));
  const [advWidth, setAdvWidth] = useState(() => advOf(latestOf(initialImages)?.req_width));
  const [advHeight, setAdvHeight] = useState(() => advOf(latestOf(initialImages)?.req_height));
  const [referenceNotice, setReferenceNotice] = useState<string | null>(null);
  const [isUploadingRef, setIsUploadingRef] = useState(false);
  const [isUploadingCover, setIsUploadingCover] = useState(false);
  const [coverNotice, setCoverNotice] = useState<string | null>(null);
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

  function reuseFromHistory(img: DraftImageRow) {
    setPromptDraft(img.image_prompt ?? '');
    setNegativeDraft(img.negative_prompt ?? '');
    if (img.style_slug && options.styles.some((s) => s.slug === img.style_slug)) setStyleSlug(img.style_slug);
    if (img.camera_slug && (options.cameras ?? []).some((c) => c.slug === img.camera_slug)) setCameraSlug(img.camera_slug);
    // subject tidak ada di baris cover → jangan tebak, biarkan pilihan user.
    // advanced: kosong = Auto (tiru StudioForm optNum).
    setAdvGuidance(advOf(img.guidance));
    setAdvSteps(advOf(img.steps));
    setAdvSeed(advOf(img.seed));
    setAdvWidth(advOf(img.req_width));
    setAdvHeight(advOf(img.req_height));
    setProposed(null);
    try {
      setNotice(t('reusedFrom', { id: img.id.slice(0, 8) }));
    } catch {
      setNotice(`Dipakai dari riwayat ${img.id.slice(0, 8)} — cek lalu Regenerate.`);
    }
  }

  function enqueue() {
    const p = promptDraft.trim();
    const n = negativeDraft.trim();
    if (p && p.length < 10) {
      setNotice('Prompt minimal 10 karakter (EN, ≤60 kata, akan ditambah style suffix).');
      return;
    }
    const pinned = options.models.find((m) => m.id === modelUuid) ?? null;
    if (referenceUrl && pinned && pinned.supports_reference === false) {
      setNotice(`Model ${pinned.display_name} tidak mendukung image reference — pilih model bertanda ref atau Auto.`);
      return;
    }
    // Advanced: kosong = Auto; angka di luar rentang ditolak cepat (worker clamp final).
    const parseAdv = (raw: string): number | null => {
      const t = raw.trim();
      if (!t) return null;
      const num = Number(t);
      return Number.isFinite(num) ? num : null;
    };
    const guidance = parseAdv(advGuidance);
    const steps = parseAdv(advSteps);
    const seed = parseAdv(advSeed);
    const reqWidth = parseAdv(advWidth);
    const reqHeight = parseAdv(advHeight);
    if (guidance !== null && (guidance < 0 || guidance > 10)) {
      setNotice('Guidance harus 0–10 (atau kosongkan untuk Auto).');
      return;
    }
    if (steps !== null && (!Number.isInteger(steps) || steps < 1 || steps > 50)) {
      setNotice('Steps harus bilangan bulat 1–50 (atau kosongkan untuk Auto).');
      return;
    }
    if (seed !== null && (!Number.isInteger(seed) || seed < 0)) {
      setNotice('Seed harus bilangan bulat ≥0 (atau kosongkan untuk Auto).');
      return;
    }
    if (
      (reqWidth !== null && (!Number.isInteger(reqWidth) || reqWidth < 256 || reqWidth > 2500)) ||
      (reqHeight !== null && (!Number.isInteger(reqHeight) || reqHeight < 256 || reqHeight > 2500))
    ) {
      setNotice('Dimensi harus bilangan bulat 256–2500 (atau kosongkan untuk Auto).');
      return;
    }
    setNotice(p ? 'Menyiapkan generate...' : 'Meminta reasoning otomatis...');
    setProposed(null);
    startTransition(async () => {
      try {
        await generateDraftImage(draftId, {
          autoEnhance,
          modelUuid: modelUuid || null,
          styleSlug: styleSlug || null,
          cameraSlug: cameraSlug || null,
          imagePrompt: p || null,
          negativePrompt: n || null,
          referencePublicUrl: referenceUrl,
          referenceStrength: referenceUrl ? referenceStrength : null,
          guidance,
          steps,
          seed,
          reqWidth,
          reqHeight
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
      // suggest hanya menghasilkan prompt (tanpa negative LLM) — isi default
      // statis bila textarea negative masih kosong agar negative tetap ikut.
      if (!negativeDraft.trim()) setNegativeDraft('no text, watermark, logo');
      setProposed(null);
      setNotice(`Prompt awal siap (${res.subjectName}) — cek, edit bila perlu, lalu Sempurnakan.`);
    } catch (e) {
      setNotice(e instanceof Error ? `Gagal: ${e.message}` : 'Siapkan prompt gagal.');
    } finally {
      setIsSuggesting(false);
    }
  }

  async function handleReferenceUpload(file: File) {
    if (file.size > 5 * 1024 * 1024) {
      setReferenceNotice('Referensi maksimal 5MB — kecilkan dulu.');
      return;
    }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type.toLowerCase())) {
      setReferenceNotice('Referensi harus gambar JPEG/PNG/WebP.');
      return;
    }
    setIsUploadingRef(true);
    setReferenceNotice('Mengunggah referensi...');
    try {
      const fd = new FormData();
      fd.append('file', file);
      const { publicUrl } = await uploadDraftImageReference(draftId, fd);
      setReferenceUrl(publicUrl);
      // Bila model terpin non-support → reset ke Auto agar tidak gagal jujur.
      const pinned = options.models.find((m) => m.id === modelUuid) ?? null;
      if (pinned && pinned.supports_reference === false) setModelUuid('');
      setReferenceNotice('Referensi siap — pilih model bertanda ref atau Auto.');
    } catch (e) {
      setReferenceNotice(e instanceof Error ? e.message : 'Upload referensi gagal.');
    } finally {
      setIsUploadingRef(false);
    }
  }

  async function handleCoverUpload(file: File) {
    if (file.size > 5 * 1024 * 1024) {
      setCoverNotice('Cover maksimal 5MB — kecilkan dulu.');
      return;
    }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type.toLowerCase())) {
      setCoverNotice('Cover harus gambar JPEG/PNG/WebP.');
      return;
    }
    setIsUploadingCover(true);
    setCoverNotice('Mengunggah cover...');
    try {
      const fd = new FormData();
      fd.append('file', file);
      await uploadDraftCoverImage(draftId, fd);
      const rows = await listDraftImages(draftId);
      const cover = rows.filter((r) => (r.post_index ?? 0) === 0);
      setImages(cover);
      const sel = cover.find((r) => r.status === 'selected') ?? null;
      setSelectedId(sel?.id ?? null);
      setCoverNotice('Cover terpasang — jadi visual review, publish & antrean social.');
    } catch (e) {
      setCoverNotice(e instanceof Error ? e.message : 'Upload cover gagal.');
    } finally {
      setIsUploadingCover(false);
    }
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
      const res = await enhanceImagePrompt(draftId, 0, p, negativeDraft.trim() || null, styleSlug || null, subjectSlug || null, cameraSlug || null, llmModelUuid || null);
      setProposed({ prompt: res.image_prompt, negative: res.negative_prompt, reasoning: res.reasoning, styleSlug: res.style_slug, subjectSlug: res.subject_slug, cameraSlug: res.camera_slug });
      setNotice('Usulan siap — cek side-by-side, lalu Terima atau Batal.');
    } catch (e) {
      setNotice(e instanceof Error ? `Gagal enhance: ${e.message}` : 'Enhance gagal.');
    } finally {
      setIsEnhancing(false);
    }
  }

  function acceptProposed() {
    if (!proposed) return;
    setPrevPrompt({ prompt: promptDraft, negative: negativeDraft, styleSlug: styleSlug || null, subjectSlug: subjectSlug || null, cameraSlug: cameraSlug || null });
    setPromptDraft(proposed.prompt);
    setNegativeDraft(proposed.negative ?? '');
    if (proposed.styleSlug != null) setStyleSlug(proposed.styleSlug);
    if (proposed.subjectSlug != null) setSubjectSlug(proposed.subjectSlug);
    if (proposed.cameraSlug != null) setCameraSlug(proposed.cameraSlug);
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
      <details open={!defaultCollapsed} className="space-y-3">
        <summary className="flex flex-wrap items-center justify-between gap-2 cursor-pointer list-none [&::-webkit-details-marker]:hidden">
          <h2 className="text-sm font-semibold">Visualisasi pendukung</h2>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={refresh}
              disabled={isPending}
              className="text-xs text-primary hover:underline disabled:opacity-50"
            >
              {isPending ? 'Memuat...' : 'Muat ulang'}
            </button>
            <button
              type="button"
              onClick={enqueue}
              disabled={isPending || isEnhancing || isSuggesting}
              className="rounded-lg bg-primary px-2 py-0.5 text-xs font-medium text-white disabled:opacity-50"
            >
              {isPending ? '...' : hasVisual ? 'Regenerate' : 'Generate'}
            </button>
          </div>
        </summary>
        <div className="space-y-3">

      {images.length > 0 ? (
        <div className="mt-3">
          <ImageHistoryCarousel
            rows={images}
            selectedId={selectedId}
            variant="cover"
            isPending={isPending}
            onSelect={select}
            onRetry={retry}
            onUseAsReference={(url) => {
              setReferenceUrl(url);
              setReferenceNotice('Referensi diambil dari histori — pilih model bertanda ref atau Auto.');
            }}
            onReuse={reuseFromHistory}
            modelOptions={options.models}
            locale={locale}
            timeZone={timeZone}
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
                {m.supports_reference ? ' · ref' : ''}
                {m.text_capable ? ' · teks' : ''}
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
            <option value="">(tanpa subjek khusus)</option>
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
      <ReferencePicker
        title="Gambar referensi (opsional, img2img)"
        history={images}
        referenceUrl={referenceUrl}
        referenceStrength={referenceStrength}
        modelUuid={modelUuid}
        models={options.models}
        disabled={isPending}
        busy={isUploadingRef}
        onUpload={(f) => void handleReferenceUpload(f)}
        onSelectUrl={setReferenceUrl}
        onStrength={setReferenceStrength}
        notice={referenceNotice}
      />
      <details className="mt-2 rounded-lg border border-line bg-background p-2 text-xs">
        <summary className="cursor-pointer font-medium text-ink">Parameter advanced (opsional)</summary>
        <p className="mt-0.5 text-[11px] text-ink-muted">Kosongkan = Auto (hemat, maks 1024px / 25 steps). Phoenix/Lucid bertanda teks hanya manual.</p>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <label className="grid gap-0.5">
            <span className="text-ink-muted">Guidance (0–10)</span>
            <input type="number" min={0} max={10} step={0.5} value={advGuidance} onChange={(e) => setAdvGuidance(e.target.value)} placeholder="Auto" className="w-full rounded-lg border border-line bg-surface px-2 py-1.5 text-sm" />
          </label>
          <label className="grid gap-0.5">
            <span className="text-ink-muted">Steps (1–50)</span>
            <input type="number" min={1} max={50} step={1} value={advSteps} onChange={(e) => setAdvSteps(e.target.value)} placeholder="Auto" className="w-full rounded-lg border border-line bg-surface px-2 py-1.5 text-sm" />
          </label>
          <label className="grid gap-0.5">
            <span className="text-ink-muted">Seed</span>
            <input type="number" min={0} step={1} value={advSeed} onChange={(e) => setAdvSeed(e.target.value)} placeholder="Auto" className="w-full rounded-lg border border-line bg-surface px-2 py-1.5 text-sm" />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="grid gap-0.5">
              <span className="text-ink-muted">Lebar (256–2500)</span>
              <input type="number" min={256} max={2500} step={64} value={advWidth} onChange={(e) => setAdvWidth(e.target.value)} placeholder="Auto" className="w-full rounded-lg border border-line bg-surface px-2 py-1.5 text-sm" />
            </label>
            <label className="grid gap-0.5">
              <span className="text-ink-muted">Tinggi (256–2500)</span>
              <input type="number" min={256} max={2500} step={64} value={advHeight} onChange={(e) => setAdvHeight(e.target.value)} placeholder="Auto" className="w-full rounded-lg border border-line bg-surface px-2 py-1.5 text-sm" />
            </label>
          </div>
        </div>
      </details>
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
      {llmModels.length > 0 ? (
        <label className="mt-2 text-xs">
          <span className="mb-1 block text-ink-muted">Model LLM Sempurnakan (opsional pin)</span>
          <select
            value={llmModelUuid}
            onChange={(e) => setLlmModelUuid(e.target.value)}
            disabled={isPending || isEnhancing || isSuggesting}
            className="w-full rounded-lg border border-line bg-background px-2 py-1.5 text-sm disabled:opacity-60"
          >
            <option value="">Auto (default stage)</option>
            {llmModels.map((m) => (
              <option key={m.id} value={m.id}>
                {m.display_name}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={handleSuggest}
          disabled={isPending || isEnhancing || isSuggesting || options.subjects.length === 0}
          aria-busy={isSuggesting}
          className="rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-medium text-ink hover:border-primary disabled:opacity-50"
          title={options.subjects.length === 0 ? 'Belum ada template subjek aktif' : 'Buat draf prompt dari template subjek + isi postingan'}
        >
          {isSuggesting ? 'Menyiapkan...' : 'Siapkan prompt awal'}
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
        {prevPrompt ? (
          <button
            type="button"
            onClick={() => {
              setPromptDraft(prevPrompt.prompt);
              setNegativeDraft(prevPrompt.negative);
              if (prevPrompt.styleSlug != null) setStyleSlug(prevPrompt.styleSlug);
              if (prevPrompt.subjectSlug != null) setSubjectSlug(prevPrompt.subjectSlug);
              if (prevPrompt.cameraSlug != null) setCameraSlug(prevPrompt.cameraSlug);
              setPrevPrompt(null);
              setNotice('Dikembalikan ke draf sebelumnya.');
            }}
            className="text-sm text-ink-muted hover:text-primary"
          >
            Urungkan
          </button>
        ) : null}
        <label className="ml-2 flex items-center gap-1 text-[11px] text-ink-muted cursor-pointer">
          <input
            type="checkbox"
            checked={autoEnhance}
            onChange={(e) => setAutoEnhance(e.target.checked)}
            disabled={isPending || isEnhancing || isSuggesting}
            className="rounded border-line bg-background"
          />
          {t('autoEnhanceLabel')}
        </label>
        <span className="ml-2 text-[11px] text-ink-muted">Sempurnakan = side-by-side (prompt+negative) → Terima/Batal → Regenerate.</span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-line bg-background px-3 py-2">
        <label className="text-xs text-ink">
          <span className="mb-1 block font-medium">Upload cover manual (alternatif bila generate gagal)</span>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            disabled={isPending || isUploadingCover}
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) void handleCoverUpload(f);
            }}
            className="block text-xs text-ink-muted file:mr-2 file:rounded-lg file:border file:border-line file:bg-surface file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-ink hover:file:border-primary disabled:opacity-50"
          />
        </label>
        {isUploadingCover ? <span className="text-xs text-ink-muted">Mengunggah…</span> : null}
        {coverNotice && !isUploadingCover ? (
          <span role="status" className="text-xs text-ink-muted">{coverNotice}</span>
        ) : null}
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
              {(proposed.styleSlug || proposed.subjectSlug || proposed.cameraSlug) ? (
                <div className="mt-2 space-y-0.5 text-[11px] text-ink-muted">
                  {proposed.styleSlug ? (
                    <p>Style: {options.styles.find((s) => s.slug === proposed.styleSlug)?.display_name ?? proposed.styleSlug}</p>
                  ) : null}
                  {proposed.subjectSlug ? (
                    <p>Subjek: {options.subjects.find((s) => s.slug === proposed.subjectSlug)?.display_name ?? proposed.subjectSlug}</p>
                  ) : null}
                  {proposed.cameraSlug ? (
                    <p>Camera: {(options.cameras ?? []).find((c) => c.slug === proposed.cameraSlug)?.display_name ?? proposed.cameraSlug}</p>
                  ) : null}
                </div>
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
          </div>
        </div>
      ) : null}

      {notice ? (
        <p role="status" className="mt-3 rounded-lg bg-background px-2 py-1.5 text-xs text-ink-muted">
          {notice}
        </p>
      ) : null}
        </div>
      </details>
    </section>
  );
}
