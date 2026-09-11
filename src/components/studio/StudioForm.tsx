'use client';

import { useState, useTransition } from 'react';
import { enqueueStudioImage, type EnqueueStudioInput } from '@/lib/studio/actions';
import type { StudioOptions } from '@/lib/studio/types';
import { useTranslations } from 'next-intl';

interface Props {
  options: StudioOptions | null;
  quota: { used: number; remaining: number | null; limit: number | null | undefined } | null;
}

export function StudioForm({ options, quota }: Props) {
  const t = useTranslations('studio');
  const tForm = useTranslations('studio.form');
  const tNotice = useTranslations('studio.notice');

  const [prompt, setPrompt] = useState('');
  const [negative, setNegative] = useState('');
  const [providerId, setProviderId] = useState('');
  const [modelId, setModelId] = useState('');
  const [styleSlug, setStyleSlug] = useState('');
  const [subjectSlug, setSubjectSlug] = useState('');
  const [cameraSlug, setCameraSlug] = useState(options?.config.default_camera_slug ?? '');
  const [aspectSlug, setAspectSlug] = useState(options?.config.default_aspect_slug ?? '1:1');
  const [notice, setNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const maxPrompt = options?.config.max_prompt_length ?? 500;
  const negativeTrimmed = negative.trim();

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
          aspectSlug: aspectSlug
        };
        await enqueueStudioImage(input);
        setNotice(tNotice('enqueue'));
        setPrompt('');
        setNegative('');
      } catch (err) {
        setNotice(err instanceof Error ? err.message : tForm('errorInput'));
      }
    });
  }

  const isSubmitDisabled = isPending || !prompt.trim() || !options || (typeof quota?.remaining === 'number' && quota.remaining <= 0);
  const isSubmitting = isPending;
  // Field input hanya disable saat submit berjalan / opsi belum ada — bukan
  // saat prompt kosong (user harus bisa mengetik dulu).
  const fieldsDisabled = isPending || !options;

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
            {options?.models
              .filter((m) => !providerId || m.provider_id === providerId)
              .map((m) => (
                <option key={m.id} value={m.id}>
                  {m.provider_slug} · {m.display_name}
                </option>
              ))}
          </select>
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

      <button
        type="submit"
        disabled={isSubmitDisabled}
        aria-busy={isSubmitting}
        className="w-full rounded-md border border-transparent bg-primary px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
      >
        {isSubmitting ? tForm('submitting') : tForm('submit')}
      </button>

      {notice ? (
        <p role="status" className="text-sm text-ink-muted">
          {notice}
        </p>
      ) : null}
    </form>
  );
}
