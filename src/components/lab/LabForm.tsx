'use client';

import { useEffect, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { runChatLabBatch } from '@/lib/lab/actions';
import type { LabBatchRow, LabOptions, LabRunRow } from '@/lib/lab/types';

interface ReuseSource {
  batch: LabBatchRow;
  runs: LabRunRow[];
}

interface Props {
  options: LabOptions | null;
  quota: { used: number; remaining: number | null; limit: number | null | undefined } | null;
  /** Batch histori untuk "Pakai ulang" — form diisi sekali per klik. */
  reuseBatch?: ReuseSource | null;
  /** Dipanggil dengan batchId baru setelah submit sukses. */
  onComplete?: (batchId: string) => void;
}

interface TargetSel {
  providerId: string;
  modelId: string;
}

const inputCls =
  'w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-primary';
const labelCls = 'mb-1 block text-sm font-medium text-ink';

export function LabForm({ options, quota, reuseBatch, onComplete }: Props) {
  const t = useTranslations('lab');
  const tForm = useTranslations('lab.form');
  const tNotice = useTranslations('lab.notice');

  const [system, setSystem] = useState('');
  const [prompt, setPrompt] = useState('');
  const [temperature, setTemperature] = useState('');
  const [maxTokens, setMaxTokens] = useState('');
  const [targets, setTargets] = useState<TargetSel[]>([{ providerId: '', modelId: '' }]);
  const [notice, setNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [lastReuseId, setLastReuseId] = useState<string | null>(null);

  const maxTargets = options?.config.max_targets ?? 3;
  const defaultTemp = options?.config.default_temperature;
  const defaultMax = options?.config.default_max_tokens ?? 1000;

  // "Pakai ulang" dari riwayat: isi form dari batch (sekali per klik).
  useEffect(() => {
    if (!reuseBatch || reuseBatch.batch.id === lastReuseId) return;
    setLastReuseId(reuseBatch.batch.id);
    setSystem(reuseBatch.batch.system_prompt ?? '');
    setPrompt(reuseBatch.batch.user_prompt);
    setTemperature(reuseBatch.batch.temperature !== null ? String(reuseBatch.batch.temperature) : '');
    setMaxTokens(reuseBatch.batch.max_tokens !== null ? String(reuseBatch.batch.max_tokens) : '');
    const fromRuns = reuseBatch.runs
      .filter((r) => r.provider_id && r.model_id)
      .map((r) => ({ providerId: r.provider_id as string, modelId: r.model_id as string }));
    setTargets(fromRuns.length > 0 ? fromRuns.slice(0, maxTargets) : [{ providerId: '', modelId: '' }]);
    setNotice(tForm('reused'));
  }, [reuseBatch, lastReuseId, maxTargets, tForm]);

  function setTarget(i: number, patch: Partial<TargetSel>) {
    setTargets((prev) => prev.map((t, idx) => (idx === i ? { ...t, ...patch } : t)));
  }

  function modelsFor(providerId: string) {
    return (options?.models ?? []).filter((m) => !providerId || m.provider_id === providerId);
  }

  const quotaExhausted =
    quota?.limit !== null && quota?.limit !== undefined && (quota?.remaining ?? 1) <= 0;

  function clientError(): string | null {
    if (prompt.trim().length < 10) return tForm('promptMin');
    if (targets.length < 1) return tForm('targetHeading');
    const modelIds = targets.map((x) => x.modelId);
    if (modelIds.some((id) => !id)) return tForm('modelLabel');
    if (new Set(modelIds).size !== modelIds.length) return tForm('targetHeading');
    return null;
  }

  const invalid = clientError() !== null || quotaExhausted || isPending;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const err = clientError();
    if (err || quotaExhausted) {
      setNotice(err ?? t('quota.exhausted', { limit: quota?.limit ?? 0 }));
      return;
    }
    setNotice(tNotice('running', { count: targets.length }));
    startTransition(async () => {
      const tempNum = temperature.trim() === '' ? null : Number(temperature);
      const maxNum = maxTokens.trim() === '' ? null : Number(maxTokens);
      const res = await runChatLabBatch({
        systemPrompt: system.trim() || null,
        userPrompt: prompt.trim(),
        temperature: tempNum !== null && Number.isFinite(tempNum) ? tempNum : null,
        maxTokens: maxNum !== null && Number.isFinite(maxNum) ? Math.floor(maxNum) : null,
        targets: targets.map((x) => ({ providerId: x.providerId, modelId: x.modelId }))
      });
      if (!res.ok) {
        setNotice(res.error);
        return;
      }
      setNotice(null);
      onComplete?.(res.data.batchId);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="lab-system" className={labelCls}>{tForm('systemLabel')}</label>
        <textarea
          id="lab-system"
          rows={2}
          value={system}
          onChange={(e) => setSystem(e.target.value)}
          placeholder={tForm('systemPlaceholder')}
          maxLength={2000}
          className={inputCls}
        />
        <p className="mt-1 text-xs text-ink-muted">{tForm('systemChar', { current: system.length })}</p>
      </div>

      <div>
        <label htmlFor="lab-prompt" className={labelCls}>{tForm('promptLabel')}</label>
        <textarea
          id="lab-prompt"
          rows={4}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={tForm('promptPlaceholder')}
          maxLength={4000}
          required
          className={inputCls}
        />
        <p className="mt-1 text-xs text-ink-muted">{tForm('promptChar', { current: prompt.length })}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="lab-temp" className={labelCls}>
            {tForm('tempLabel', { value: defaultTemp ?? '–' })}
          </label>
          <input
            id="lab-temp"
            type="number"
            min={0}
            max={2}
            step={0.1}
            value={temperature}
            onChange={(e) => setTemperature(e.target.value)}
            placeholder={defaultTemp !== null && defaultTemp !== undefined ? String(defaultTemp) : ''}
            className={inputCls}
          />
        </div>
        <div>
          <label htmlFor="lab-max" className={labelCls}>
            {tForm('maxTokensLabel', { value: defaultMax })}
          </label>
          <input
            id="lab-max"
            type="number"
            min={1}
            max={8000}
            step={1}
            value={maxTokens}
            onChange={(e) => setMaxTokens(e.target.value)}
            placeholder={String(defaultMax)}
            className={inputCls}
          />
        </div>
      </div>

      <fieldset>
        <legend className="mb-2 text-sm font-medium text-ink">{tForm('targetHeading')}</legend>
        <div className="space-y-3">
          {targets.map((tg, i) => (
            <div key={i} className="grid gap-2 rounded-lg border border-line p-3 sm:grid-cols-[1fr_1fr_auto]">
              <div>
                <label htmlFor={`lab-prov-${i}`} className={labelCls}>
                  {tForm('targetLabel', { n: i + 1 })} · {tForm('providerLabel')}
                </label>
                <select
                  id={`lab-prov-${i}`}
                  value={tg.providerId}
                  onChange={(e) => setTarget(i, { providerId: e.target.value, modelId: '' })}
                  className={inputCls}
                >
                  <option value="">—</option>
                  {(options?.providers ?? []).map((p) => (
                    <option key={p.id} value={p.id}>{p.display_name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor={`lab-model-${i}`} className={labelCls}>{tForm('modelLabel')}</label>
                <select
                  id={`lab-model-${i}`}
                  value={tg.modelId}
                  onChange={(e) => {
                    const m = (options?.models ?? []).find((x) => x.id === e.target.value);
                    setTarget(i, { modelId: e.target.value, providerId: m ? m.provider_id : tg.providerId });
                  }}
                  className={inputCls}
                >
                  <option value="">—</option>
                  {modelsFor(tg.providerId).map((m) => (
                    <option key={m.id} value={m.id}>{m.display_name}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-end">
                {targets.length > 1 ? (
                  <button
                    type="button"
                    onClick={() => setTargets((prev) => prev.filter((_, idx) => idx !== i))}
                    className="rounded-md border border-line px-2 py-2 text-xs text-ink-muted hover:text-red-600"
                    aria-label={tForm('removeTarget', { n: i + 1 })}
                  >
                    ✕
                  </button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
        {targets.length < maxTargets ? (
          <button
            type="button"
            onClick={() => setTargets((prev) => [...prev, { providerId: '', modelId: '' }])}
            className="mt-2 rounded-md border border-line px-3 py-1.5 text-xs text-primary hover:underline"
          >
            + {tForm('addTarget')}
          </button>
        ) : null}
      </fieldset>

      {notice ? (
        <p role="status" className="text-sm text-ink-muted">{notice}</p>
      ) : null}

      <button
        type="submit"
        disabled={invalid}
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isPending ? tForm('submitting') : tForm('submit')}
      </button>
    </form>
  );
}
