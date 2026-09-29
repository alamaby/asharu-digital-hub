'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { enqueueStudioBatch, type EnqueueBatchInput } from '@/lib/studio/actions';
import type { StudioOptions } from '@/lib/studio/types';
import { parseBatchPrompts, validateBatchPrompts } from '@/lib/studio/validation';

interface Props {
  options: StudioOptions | null;
  /** Dipanggil setelah enqueue sukses — parent me-refresh list riwayat agar batch baru tampil. */
  onEnqueued?: () => void;
}

export function BatchForm({ options, onEnqueued }: Props) {
  const t = useTranslations('studio.batch');
  const tForm = useTranslations('studio.batch.form');
  const tStudioForm = useTranslations('studio.form');
  const [raw, setRaw] = useState('');
  const [batchName, setBatchName] = useState('');
  const [parsedCount, setParsedCount] = useState<number | null>(null);
  const [rejected, setRejected] = useState<{ index: number; reason: string }[]>([]);
  const [aspectSlug, setAspectSlug] = useState(options?.config.default_aspect_slug ?? '1:1');
  const [notice, setNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const hiddenRef = useRef<HTMLTextAreaElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  // Pilihan tersimpan localStorage (hanya untuk UX — server-side validasi tetap pakai tabel).
  const LS_KEY = 'asharu-studio-batch-last';

  function loadLast(): void {
    try {
      const s = localStorage.getItem(LS_KEY);
      if (!s) return;
      const j = JSON.parse(s) as { aspect?: string } | null;
      if (j?.aspect) setAspectSlug(j.aspect);
    } catch { /* ignore corupt */ }
  }
  function saveLast(): void {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({ aspect: aspectSlug }));
    } catch { /* ignore */ }
  }

  useEffect(() => {
    loadLast();
  }, []);

  const effectiveMax = options?.config.max_batch_prompts ?? 50;

  function onRawChange(next: string) {
    setRaw(next);
    const prompts = parseBatchPrompts(next);
    const { valid, rejected: rej } = validateBatchPrompts(prompts, options?.config.max_prompt_length ?? 500, effectiveMax);
    setParsedCount(valid.length + rej.length);
    setRejected(rej);
  }

  async function onFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
    if (!['txt', 'md'].includes(ext)) {
      setNotice(tForm('fileBadType'));
      return;
    }
    if (file.size > 102400) {
      setNotice(tForm('fileTooBig'));
      return;
    }
    const text = await file.text();
    onRawChange(text);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isPending) return;
    const prompts = parseBatchPrompts(raw);
    const { valid, rejected: rej, batchRejected } = validateBatchPrompts(prompts, options?.config?.max_prompt_length ?? 500, effectiveMax);
    setRejected(rej);
    if (rej.length > 0 || batchRejected) {
      if (batchRejected) {
        setNotice(batchRejected);
      } else if (rej.length > 0 && rej[0]) {
        setNotice(`${rej[0].index} prompt tidak valid (${rej[0].reason}).`);
      }
      return;
    }
    if (valid.length === 0) {
      setNotice(tForm('rejectedBlocks', { count: 0, reason: 'kosong' }));
      return;
    }
    saveLast();
    startTransition(async () => {
      const input: EnqueueBatchInput = {
        prompts: valid,
        batchName: batchName.trim() || null,
        negativePrompt: null,
        providerId: null,
        modelId: null,
        styleSlug: options?.config.default_style_slug ?? null,
        subjectSlug: options?.config.default_subject_slug ?? null,
        cameraSlug: options?.config.default_camera_slug ?? null,
        aspectSlug,
        guidance: null,
        steps: null,
        seed: null,
        reqWidth: null,
        reqHeight: null,
      };
      const res = await enqueueStudioBatch(input);
      if (res.ok) {
        const n = res.data.enqueued;
        setNotice(t('form.submitted', { count: n }));
        setRaw('');
        setParsedCount(null);
        setRejected([]);
        setBatchName('');
        onEnqueued?.();
      } else {
        setNotice(res.error);
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div>
        <label htmlFor="batch-text" className="mb-1 block text-sm font-medium text-ink">
          {tForm('textLabel')}
        </label>
        <textarea
          ref={hiddenRef}
          id="batch-text"
          rows={10}
          className="w-full rounded-md border border-line bg-surface p-3 text-sm leading-relaxed text-ink placeholder:text-ink-muted focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          placeholder={tForm('textPlaceholder')}
          value={raw}
          onChange={(e) => onRawChange(e.target.value)}
          aria-describedby="batch-preview"
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="inline-flex items-center gap-2 rounded-md border border-line bg-surface px-3 py-1.5 text-sm text-ink transition-colors hover:bg-line"
        >
          {tForm('fileUpload')}
        </button>
        <input ref={fileRef} type="file" accept=".txt,.md" className="hidden" onChange={onFileUpload} />
        {parsedCount !== null && (
          <span id="batch-preview" role="status" className="text-sm text-ink-muted">
            {tForm('previewCount', { count: parsedCount })}
          </span>
        )}
        {rejected.length > 0 && (
          <span role="alert" className="text-sm text-red-600">
            {tForm('rejectedBlocks', { count: rejected.length, reason: rejected.map((r) => r.reason).join('; ') })}
          </span>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="batch-name" className="mb-1 block text-sm font-medium text-ink">
            {tForm('nameLabel')}
          </label>
          <input
            id="batch-name"
            type="text"
            maxLength={120}
            className="w-full rounded-md border border-line bg-surface p-2 text-sm text-ink placeholder:text-ink-muted focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            placeholder={tForm('namePlaceholder')}
            value={batchName}
            onChange={(e) => setBatchName(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="batch-aspect" className="mb-1 block text-sm font-medium text-ink">
            {tStudioForm('aspectLabel')}
          </label>
          <select
            id="batch-aspect"
            className="w-full rounded-md border border-line bg-surface p-2 text-sm text-ink focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            value={aspectSlug}
            onChange={(e) => setAspectSlug(e.target.value)}
          >
            {(options?.aspects ?? []).map((a) => (
              <option key={a.slug} value={a.slug}>
                {a.display_name} ({a.width}x{a.height})
              </option>
            ))}
          </select>
        </div>
      </div>

      {notice ? (
        <p role="status" aria-live="polite" className="rounded-md border border-line bg-surface p-3 text-sm text-ink">
          {notice}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={isPending}
        className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-on-primary transition-colors hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isPending
          ? tForm('submitting', { count: parsedCount ?? 0 })
          : tForm('submit')}
      </button>
    </form>
  );
}
