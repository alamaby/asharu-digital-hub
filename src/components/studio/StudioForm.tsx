'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { enhanceStudioPrompt, enqueueStudioImage, uploadStudioReference, type EnqueueStudioInput } from '@/lib/studio/actions';
import type { StudioGenerationRow, StudioOptions } from '@/lib/studio/types';
import { useTranslations } from 'next-intl';

interface Props {
  options: StudioOptions | null;
  quota: { used: number; remaining: number | null; limit: number | null | undefined } | null;
  /** Baris histori untuk "Pakai ulang" — form diisi sekali per klik. */
  reuseRow?: StudioGenerationRow | null;
  /** Dipanggil setelah enqueue sukses — parent me-refresh list riwayat agar baris pending tampil. */
  onEnqueued?: () => void;
}

export function StudioForm({ options, quota, reuseRow, onEnqueued }: Props) {
  const t = useTranslations('studio');
  const tForm = useTranslations('studio.form');
  const tNotice = useTranslations('studio.notice');
  const tEnhance = useTranslations('studio.enhance');

  const [prompt, setPrompt] = useState('');
  const [negative, setNegative] = useState('');
  const [providerId, setProviderId] = useState('');
  const [modelId, setModelId] = useState('');
  const [styleSlug, setStyleSlug] = useState('');
  const [subjectSlug, setSubjectSlug] = useState('');
  const [cameraSlug, setCameraSlug] = useState(options?.config.default_camera_slug ?? '');
  const [aspectSlug, setAspectSlug] = useState(options?.config.default_aspect_slug ?? '1:1');
  // Pin model LLM untuk enhance (Auto = stage default enhance_image_prompt).
  const [llmProviderId, setLlmProviderId] = useState('');
  const [llmModelId, setLlmModelId] = useState('');
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [proposed, setProposed] = useState<{ prompt: string; negative?: string } | null>(null);
  const [prevPrompt, setPrevPrompt] = useState<{ prompt: string; negative: string } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [lastReuseId, setLastReuseId] = useState<string | null>(null);
  // Referensi img2img: upload baru (preview lokal) atau URL milik user.
  const [referenceUrl, setReferenceUrl] = useState<string | null>(null);
  const [referencePreview, setReferencePreview] = useState<string | null>(null);
  const [referenceStrength, setReferenceStrength] = useState(0.6);
  const [isUploadingRef, setIsUploadingRef] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // "Pakai ulang" dari riwayat: isi form dari baris (sekali per klik).
  useEffect(() => {
    if (!reuseRow || reuseRow.id === lastReuseId) return;
    setLastReuseId(reuseRow.id);
    setPrompt(reuseRow.image_prompt);
    setNegative(reuseRow.negative_prompt ?? '');
    setProviderId(reuseRow.provider_id ?? '');
    setModelId(reuseRow.model_id ?? '');
    setStyleSlug(reuseRow.style_slug ?? '');
    setSubjectSlug(reuseRow.subject_slug ?? '');
    setCameraSlug(reuseRow.camera_slug ?? '');
    if (reuseRow.aspect_slug) setAspectSlug(reuseRow.aspect_slug);
    if (reuseRow.reference_public_url) {
      setReferenceUrl(reuseRow.reference_public_url);
      setReferencePreview(reuseRow.reference_public_url);
    }
    const s = Number(reuseRow.reference_strength);
    if (Number.isFinite(s) && s >= 0 && s <= 1) setReferenceStrength(s);
    setProposed(null);
    setNotice(tForm('reused'));
  }, [reuseRow, lastReuseId, tForm]);

  // Ganti provider image → reset model (pola lama, dipertahankan).
  // Ganti provider LLM → reset model LLM.

  const maxPrompt = options?.config.max_prompt_length ?? 500;
  const negativeTrimmed = negative.trim();

  // Model yang mendukung image reference (flag dari server, bukan hardcode).
  const selectedModel = options?.models.find((m) => m.id === modelId) ?? null;
  const selectedSupportsReference = selectedModel?.supports_reference ?? false;
  // Bila provider dipilih: hanya tampilkan model miliknya; bila Auto tanpa
  // referensi: semua; bila Auto + referensi: persempit ke model support.
  const visibleImageModels = (options?.models ?? []).filter((m) => {
    if (providerId && m.provider_id !== providerId) return false;
    if (!providerId && !modelId && referenceUrl && !m.supports_reference) return false;
    return true;
  });

  // Upload file referensi → Storage (server action, ≤5MB JPEG/PNG/WebP).
  async function handleReferenceFile(file: File | undefined) {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setNotice(tForm('referenceTooBig'));
      return;
    }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type.toLowerCase())) {
      setNotice(tForm('referenceBadType'));
      return;
    }
    setIsUploadingRef(true);
    setNotice(tForm('referenceUploading'));
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await uploadStudioReference(fd);
      if (!res.ok) {
        setNotice(res.error);
        return;
      }
      const { publicUrl } = res.data;
      setReferenceUrl(publicUrl);
      setReferencePreview(publicUrl);
      // Bila model terpin non-support → reset ke Auto agar tidak gagal jujur.
      if (selectedModel && !selectedModel.supports_reference) setModelId('');
      setNotice(tForm('referenceReady'));
    } catch (e) {
      setNotice(e instanceof Error ? e.message : tForm('referenceFailed'));
    } finally {
      setIsUploadingRef(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  function clearReference() {
    setReferenceUrl(null);
    setReferencePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const p = prompt.trim();
    if (p && p.length < 10) {
      setNotice(tForm('promptMin'));
      return;
    }
    if (!options) {
      setNotice(tForm('errorInput'));
      return;
    }
    const limited = quota?.remaining;
    if (typeof limited === 'number' && limited <= 0) {
      setNotice(t('quota.exhausted', { limit: quota?.limit ?? 0 }));
      return;
    }
    setNotice(tNotice('enqueue'));
    startTransition(async () => {
      try {
        const input: EnqueueStudioInput = {
          prompt: p,
          negativePrompt: negativeTrimmed || null,
          providerId: providerId || null,
          modelId: modelId || null,
          styleSlug: styleSlug || null,
          subjectSlug: subjectSlug || null,
          cameraSlug: cameraSlug || null,
          aspectSlug: aspectSlug,
          referencePublicUrl: referenceUrl,
          referenceStrength: referenceUrl ? referenceStrength : null
        };
        const res = await enqueueStudioImage(input);
        if (!res.ok) {
          setNotice(res.error);
          return;
        }
        setNotice(tNotice('enqueue'));
        setPrompt('');
        setNegative('');
        clearReference();
        onEnqueued?.();
      } catch (err) {
        setNotice(err instanceof Error ? err.message : tForm('errorInput'));
      }
    });
  }

  const isSubmitDisabled = isPending || isUploadingRef || !prompt.trim() || !options || (typeof quota?.remaining === 'number' && quota.remaining <= 0);
  const isSubmitting = isPending;
  // Field input hanya disable saat submit berjalan / opsi belum ada — bukan
  // saat prompt kosong (user harus bisa mengetik dulu).
  const fieldsDisabled = isPending || !options;
  const filteredLlmModels = llmProviderId
    ? (options?.llmModels ?? []).filter((m) => m.provider_id === llmProviderId)
    : (options?.llmModels ?? []);
  const canEnhance = !isEnhancing && !isPending && Boolean(options) && prompt.trim().length >= 10;

  async function handleEnhance() {
    const p = prompt.trim();
    if (!p || p.length < 10) {
      setNotice(tForm('promptMin'));
      return;
    }
    setIsEnhancing(true);
    setNotice(tEnhance('working'));
    try {
      const res = await enhanceStudioPrompt({
        prompt: p,
        negativePrompt: negativeTrimmed || null,
        styleSlug: styleSlug || null,
        llmModelId: llmModelId || null
      });
      if (!res.ok) {
        setNotice(`Gagal enhance: ${res.error}`);
        return;
      }
      setProposed({ prompt: res.data.image_prompt, negative: res.data.negative_prompt });
      setNotice(tEnhance('ready'));
    } catch (e) {
      setNotice(e instanceof Error ? `Gagal enhance: ${e.message}` : tEnhance('failed'));
    } finally {
      setIsEnhancing(false);
    }
  }

  function acceptProposed() {
    if (!proposed) return;
    setPrevPrompt({ prompt, negative });
    setPrompt(proposed.prompt);
    setNegative(proposed.negative ?? '');
    setProposed(null);
    setNotice(tEnhance('accepted'));
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-3" noValidate>
      <div className="grid gap-1">
        <label className="text-sm font-medium text-ink" htmlFor="studio-prompt">
          {tForm('promptLabel')}
        </label>
        <textarea
          id="studio-prompt"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value.slice(0, maxPrompt))}
          maxLength={maxPrompt}
          rows={3}
          placeholder={tForm('promptPlaceholder')}
          disabled={fieldsDisabled}
          required
          minLength={10}
          className="w-full resize-y rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink placeholder-ink-muted focus:outline-none focus:ring-2 focus:ring-primary"
        />
        <p className="text-[11px] text-ink-muted">{tForm('promptChar', { current: prompt.trim().length, max: maxPrompt })}</p>
        {prompt.trim() && prompt.trim().length < 10 ? (
          <p role="alert" className="text-[11px] text-red-600">
            {tForm('promptMin')}
          </p>
        ) : null}
      </div>

      <div className="grid gap-1">
        <label className="text-sm font-medium text-ink" htmlFor="studio-negative">
          {tForm('negativeLabel')}
        </label>
        <textarea
          id="studio-negative"
          value={negative}
          onChange={(e) => setNegative(e.target.value.slice(0, 500))}
          maxLength={500}
          rows={1}
          placeholder={tForm('negativePlaceholder')}
          disabled={fieldsDisabled}
          className="w-full resize-y rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink placeholder-ink-muted focus:outline-none focus:ring-2 focus:ring-primary"
        />
        <p className="text-[11px] text-ink-muted">{tForm('negativeChar', { current: negative.length })}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1">
          <label className="text-sm font-medium text-ink" htmlFor="studio-provider">
            {tForm('providerLabel')}
          </label>
          <select
            id="studio-provider"
            value={providerId}
            onChange={(e) => {
              setProviderId(e.target.value);
              setModelId('');
            }}
            disabled={fieldsDisabled}
            className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="">{tForm('providerAuto')}</option>
            {options?.providers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.display_name}
              </option>
            ))}
          </select>
        </div>

        <div className="grid gap-1">
          <label className="text-sm font-medium text-ink" htmlFor="studio-model">
            {tForm('modelLabel')}
          </label>
          <select
            id="studio-model"
            value={modelId}
            onChange={(e) => setModelId(e.target.value)}
            disabled={fieldsDisabled}
            className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="">{tForm('modelAuto')}</option>
            {visibleImageModels.map((m) => (
              <option key={m.id} value={m.id}>
                {m.provider_slug} · {m.display_name}
                {m.supports_reference ? ' · ref' : ''}
              </option>
            ))}
          </select>
          {referenceUrl && !modelId ? (
            <p className="text-[11px] text-ink-muted">{tForm('referenceAutoNarrowed')}</p>
          ) : null}
          {referenceUrl && selectedModel && !selectedSupportsReference ? (
            <p role="alert" className="text-[11px] text-red-600">
              {tForm('referenceModelUnsupported')}
            </p>
          ) : null}
        </div>

        <div className="grid gap-1">
          <label className="text-sm font-medium text-ink" htmlFor="studio-style">
            {tForm('styleLabel')}
          </label>
          <select
            id="studio-style"
            value={styleSlug}
            onChange={(e) => setStyleSlug(e.target.value)}
            disabled={fieldsDisabled}
            className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="">{tForm('styleAuto')}</option>
            {options?.styles.map((s) => (
              <option key={s.slug} value={s.slug}>
                {s.display_name}
              </option>
            ))}
          </select>
        </div>

        <div className="grid gap-1">
          <label className="text-sm font-medium text-ink" htmlFor="studio-subject">
            {tForm('subjectLabel')}
          </label>
          <select
            id="studio-subject"
            value={subjectSlug}
            onChange={(e) => setSubjectSlug(e.target.value)}
            disabled={fieldsDisabled}
            className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="">{tForm('subjectNone')}</option>
            {options?.subjects.map((s) => (
              <option key={s.slug} value={s.slug}>
                {s.display_name}
              </option>
            ))}
          </select>
        </div>

        <div className="grid gap-1">
          <label className="text-sm font-medium text-ink" htmlFor="studio-camera">
            {tForm('cameraLabel')}
          </label>
          <select
            id="studio-camera"
            value={cameraSlug}
            onChange={(e) => setCameraSlug(e.target.value)}
            disabled={fieldsDisabled}
            className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="">{tForm('cameraAuto')}</option>
            {options?.cameras.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.display_name}
              </option>
            ))}
          </select>
        </div>

        <div className="sm:col-span-2 grid gap-1">
          <label className="text-sm font-medium text-ink" htmlFor="studio-aspect">
            {tForm('aspectLabel')}
          </label>
          <select
            id="studio-aspect"
            value={aspectSlug}
            onChange={(e) => setAspectSlug(e.target.value)}
            disabled={fieldsDisabled}
            className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-primary"
          >
            {options?.aspects
              .sort((a, b) => a.sort_order - b.sort_order)
              .map((a) => (
                <option key={a.slug} value={a.slug}>
                  {a.display_name} ({a.width}×{a.height})
                </option>
              ))}
          </select>
        </div>
      </div>

      {/* Referensi img2img (opsional): upload atau dari histori; tanpa mask. */}
      <div className="rounded-md border border-line bg-background p-3">
        <p className="text-sm font-medium text-ink">{tForm('referenceTitle')}</p>
        <p className="mt-0.5 text-[11px] text-ink-muted">{tForm('referenceHint')}</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <label
            htmlFor="studio-reference-file"
            className={`cursor-pointer rounded-md border border-line bg-surface px-3 py-1.5 text-sm font-medium text-ink hover:border-primary ${fieldsDisabled || isUploadingRef ? 'pointer-events-none opacity-50' : ''}`}
          >
            {isUploadingRef ? tForm('referenceUploading') : tForm('referenceUpload')}
          </label>
          <input
            ref={fileInputRef}
            id="studio-reference-file"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            disabled={fieldsDisabled || isUploadingRef}
            onChange={(e) => void handleReferenceFile(e.target.files?.[0])}
          />
          {referenceUrl ? (
            <button
              type="button"
              onClick={clearReference}
              disabled={fieldsDisabled || isUploadingRef}
              className="rounded-md border border-line bg-surface px-3 py-1.5 text-sm text-ink-muted hover:border-primary disabled:opacity-50"
            >
              {tForm('referenceRemove')}
            </button>
          ) : null}
        </div>
        {referencePreview ? (
          <div className="mt-2 flex items-start gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={referencePreview} alt={tForm('referencePreviewAlt')} className="h-24 w-24 rounded object-cover" />
            <label className="grid flex-1 gap-1 text-xs" htmlFor="studio-reference-strength">
              <span className="text-ink-muted">
                {tForm('referenceStrength', { value: referenceStrength.toFixed(2) })}
              </span>
              <input
                id="studio-reference-strength"
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={referenceStrength}
                onChange={(e) => setReferenceStrength(Number(e.target.value))}
                disabled={fieldsDisabled || isUploadingRef}
                className="w-full"
              />
              <span className="text-[11px] text-ink-muted">{tForm('referenceStrengthHint')}</span>
            </label>
          </div>
        ) : null}
      </div>

      <button
        type="submit"
        disabled={isSubmitDisabled}
        aria-busy={isSubmitting}
        className="w-full rounded-md border border-transparent bg-primary px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
      >
        {isSubmitting ? tForm('submitting') : tForm('submit')}
      </button>

      {/* Enhance prompt (LLM): polish + perkaya detail, side-by-side. */}
      <div className="rounded-md border border-line bg-background p-3">
        <p className="text-sm font-medium text-ink">{tEnhance('title')}</p>
        <p className="mt-0.5 text-[11px] text-ink-muted">{tEnhance('hint')}</p>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <label className="grid gap-1 text-xs" htmlFor="studio-llm-provider">
            <span className="text-ink-muted">{tEnhance('providerLabel')}</span>
            <select
              id="studio-llm-provider"
              value={llmProviderId}
              onChange={(e) => {
                setLlmProviderId(e.target.value);
                setLlmModelId('');
              }}
              disabled={fieldsDisabled || isEnhancing}
              className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">{tEnhance('providerAuto')}</option>
              {options?.llmProviders.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.display_name}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-xs" htmlFor="studio-llm-model">
            <span className="text-ink-muted">{tEnhance('modelLabel')}</span>
            <select
              id="studio-llm-model"
              value={llmModelId}
              onChange={(e) => setLlmModelId(e.target.value)}
              disabled={fieldsDisabled || isEnhancing}
              className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">{tEnhance('modelAuto')}</option>
              {filteredLlmModels.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.display_name} ({m.model_id})
                </option>
              ))}
            </select>
          </label>
        </div>
        <button
          type="button"
          onClick={handleEnhance}
          disabled={!canEnhance}
          aria-busy={isEnhancing}
          title={!prompt.trim() || prompt.trim().length < 10 ? tForm('promptMin') : tEnhance('button')}
          className="mt-2 rounded-md border border-line bg-surface px-3 py-1.5 text-sm font-medium text-ink hover:border-primary disabled:opacity-50"
        >
          {isEnhancing ? tEnhance('working') : tEnhance('button')}
        </button>

        {proposed ? (
          <div className="mt-3 rounded-md border border-amber-300 bg-amber-50/40 p-3 text-xs">
            <p className="font-semibold text-amber-900">{tEnhance('sideBySide')}</p>
            <div className="mt-2 grid gap-3 md:grid-cols-2">
              <div className="rounded-lg border border-line bg-surface p-2">
                <p className="text-[11px] font-semibold text-ink-muted">{tEnhance('yourDraft')}</p>
                <p className="mt-1 text-ink">{prompt || '—'}</p>
                <p className="mt-2 text-ink-muted">Negative: {negative || '—'}</p>
              </div>
              <div className="rounded-lg border border-primary/30 bg-primary/10 p-2">
                <p className="text-[11px] font-semibold text-primary">{tEnhance('llmSuggestion')}</p>
                <p className="mt-1 text-ink">{proposed.prompt}</p>
                <p className="mt-2 text-ink-muted">Negative: {proposed.negative || '—'}</p>
              </div>
            </div>
            <div className="mt-2 flex gap-2">
              <button type="button" onClick={acceptProposed} className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white">
                {tEnhance('accept')}
              </button>
              <button type="button" onClick={() => setProposed(null)} className="rounded-lg border border-line bg-surface px-3 py-1.5 text-xs">
                {tEnhance('cancel')}
              </button>
              {prevPrompt ? (
                <button
                  type="button"
                  onClick={() => { setPrompt(prevPrompt.prompt); setNegative(prevPrompt.negative); setPrevPrompt(null); setNotice(tEnhance('reverted')); }}
                  className="text-xs text-ink-muted hover:text-primary"
                >
                  {tEnhance('undo')}
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>

      {notice ? (
        <p role="status" className="text-sm text-ink-muted">
          {notice}
        </p>
      ) : null}
    </form>
  );
}
