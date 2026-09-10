'use client';

import { useState } from 'react';
import {
  addBackupKey,
  addModel,
  replaceKey,
  updateLlmProviderAccountId,
  updateModelConfig,
  updateProviderBaseUrl,
  upsertStageDefault,
  type LlmActionResult
} from '@/lib/admin/llm-actions';
import { ActionNoticeView, PendingButton, type ActionNotice } from './ActionFeedback';

function toNotice(result: LlmActionResult, okMessage: string, workingMessage?: string): ActionNotice {
  if (result.ok) return { type: 'success', message: okMessage };
  return { type: 'error', message: workingMessage ?? 'Gagal menyimpan.', detail: result.error };
}

function useActionForm(okMessage: string) {
  const [notice, setNotice] = useState<ActionNotice | null>(null);
  async function run(fn: () => Promise<LlmActionResult>): Promise<boolean> {
    setNotice({ type: 'working', message: 'Menyimpan…' });
    try {
      const r = await fn();
      setNotice(toNotice(r, okMessage));
      return r.ok;
    } catch (e) {
      setNotice({ type: 'error', message: 'Gagal menyimpan.', detail: e instanceof Error ? e.message : String(e) });
      return false;
    }
  }
  return { notice, run };
}

function resetForm(id: string) {
  const form = document.getElementById(id) as HTMLFormElement | null;
  form?.reset();
}

export interface ModelConfigDefaults {
  effort: string;
  budget: string;
  level: string;
  temperature: string;
  maxTokens: string;
}

/** Form knob reasoning/max_tokens/dll per model (dengan feedback simpan). */
export function ModelConfigForm({
  modelId,
  providerId,
  defaults
}: {
  modelId: string;
  providerId: string;
  defaults: ModelConfigDefaults;
}) {
  const { notice, run } = useActionForm('Konfigurasi tersimpan.');
  return (
    <form
      action={(fd) => {
        void run(() => updateModelConfig(modelId, providerId, fd));
      }}
      className="w-full flex-wrap items-end gap-2 rounded-lg bg-canvas p-2 text-xs"
    >
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-0.5">
          <span className="text-ink-muted">reasoning</span>
          <select name="reasoning_effort" defaultValue={defaults.effort} className="rounded border border-line px-1 py-0.5">
            <option value="off">off</option>
            <option value="low">low</option>
            <option value="medium">medium</option>
            <option value="high">high</option>
            <option value="max">max</option>
          </select>
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="text-ink-muted">thinking_budget</span>
          <input name="thinking_budget" defaultValue={defaults.budget} placeholder="cth 2048" inputMode="numeric" className="w-24 rounded border border-line px-1 py-0.5" />
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="text-ink-muted">thinking_level</span>
          <select name="thinking_level" defaultValue={defaults.level} className="rounded border border-line px-1 py-0.5">
            <option value="">—</option>
            <option value="MINIMAL">MINIMAL</option>
            <option value="LOW">LOW</option>
            <option value="MEDIUM">MEDIUM</option>
            <option value="HIGH">HIGH</option>
          </select>
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="text-ink-muted">temperature</span>
          <input name="temperature" defaultValue={defaults.temperature} placeholder="0–2" inputMode="decimal" className="w-16 rounded border border-line px-1 py-0.5" />
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="text-ink-muted">max_tokens</span>
          <input name="max_tokens" defaultValue={defaults.maxTokens} placeholder="cth 4000" inputMode="numeric" className="w-24 rounded border border-line px-1 py-0.5" />
        </label>
        <PendingButton label="Simpan" />
      </div>
      {notice ? <div className="mt-2"><ActionNoticeView notice={notice} /></div> : null}
    </form>
  );
}

/** Form base_url provider. */
export function BaseUrlForm({ providerId, defaultValue }: { providerId: string; defaultValue: string }) {
  const { notice, run } = useActionForm('Base URL tersimpan.');
  return (
    <form action={(fd) => {
      void run(() => updateProviderBaseUrl(providerId, fd));
    }} className="mt-3 max-w-xl">
      <div className="flex gap-2">
        <input name="base_url" defaultValue={defaultValue} aria-label="Base URL provider" className="flex-1 rounded border border-line px-2 py-1 text-sm" />
        <PendingButton label="Simpan URL" className="rounded bg-primary px-3 py-1 text-sm text-white disabled:cursor-not-allowed disabled:opacity-60" />
      </div>
      {notice ? <div className="mt-2"><ActionNoticeView notice={notice} /></div> : null}
    </form>
  );
}

/** Form tambah model ke provider. */
export function AddModelForm({ providerId }: { providerId: string }) {
  const { notice, run } = useActionForm('Model ditambahkan.');
  return (
    <form
      action={async (fd) => {
        // Reset field teks hanya bila sukses (form uncontrolled).
        if (await run(() => addModel(providerId, fd))) resetForm(`add-model-${providerId}`);
      }}
      id={`add-model-${providerId}`}
      className="mt-4"
    >
      <div className="flex flex-wrap gap-2 rounded-lg border border-dashed border-line p-3">
        <input name="model_id" placeholder="model_id (exact)" aria-label="Model ID" className="min-w-[180px] flex-1 rounded border border-line px-2 py-1 text-sm" required />
        <input name="display_name" placeholder="display_name" aria-label="Display name" className="min-w-[140px] flex-1 rounded border border-line px-2 py-1 text-sm" />
        <label className="flex items-center gap-1 text-xs"><input type="checkbox" name="reasoning" defaultChecked /> reasoning max</label>
        <PendingButton label="Tambah Model" className="rounded bg-primary px-3 py-1 text-sm text-white disabled:cursor-not-allowed disabled:opacity-60" />
      </div>
      {notice ? <div className="mt-2"><ActionNoticeView notice={notice} /></div> : null}
    </form>
  );
}

/** Form account_id Cloudflare (identifier, bukan secret — tampil apa adanya). */
export function AccountIdForm({ providerId, defaultValue }: { providerId: string; defaultValue: string }) {
  const { notice, run } = useActionForm('Account ID tersimpan.');
  return (
    <form action={(fd) => {
      void run(() => updateLlmProviderAccountId(providerId, fd));
    }} className="mt-3 max-w-xl">
      <div className="flex gap-2">
        <input name="account_id" defaultValue={defaultValue} aria-label="Cloudflare Account ID" placeholder="32 hex char" className="flex-1 rounded border border-line px-2 py-1 font-mono text-sm" />
        <PendingButton label="Simpan ID" className="rounded bg-primary px-3 py-1 text-sm text-white disabled:cursor-not-allowed disabled:opacity-60" />
      </div>
      {notice ? <div className="mt-2"><ActionNoticeView notice={notice} /></div> : null}
    </form>
  );
}

/** Form tambah backup key (dengan field account_id untuk cloudflare). */
export function AddKeyForm({ providerId, providerSlug }: { providerId: string; providerSlug?: string }) {
  const { notice, run } = useActionForm('Backup key tersimpan ke Vault.');
  const needsAccountId = providerSlug === 'cloudflare';
  return (
    <form
      action={async (fd) => {
        if (await run(() => addBackupKey(providerId, fd))) resetForm(`add-key-${providerId}`);
      }}
      id={`add-key-${providerId}`}
      className="mt-4"
    >
      <div className="flex flex-wrap items-end gap-2 rounded-lg border border-dashed border-line p-3">
        <div className="min-w-[220px] flex-1">
          <label htmlFor={`api-key-${providerId}`} className="text-xs text-ink-muted">Tambah backup key ke provider ini</label>
          <input id={`api-key-${providerId}`} name="api_key" type="password" placeholder="sk-... / api key baru" className="mt-1 w-full rounded border border-line px-2 py-1 text-sm" required />
          <p className="mt-1 text-xs text-ink-muted">Akan disimpan ke Vault (hash ditampilkan, key tidak pernah dibaca kembali).</p>
        </div>
        {needsAccountId ? (
          <div className="min-w-[220px] flex-1">
            <label htmlFor={`account-id-${providerId}`} className="text-xs text-ink-muted">Account ID (pair cloudflare, opsional bila sudah tersimpan)</label>
            <input id={`account-id-${providerId}`} name="account_id" placeholder="32 hex char" className="mt-1 w-full rounded border border-line px-2 py-1 font-mono text-sm" />
          </div>
        ) : null}
        <PendingButton label="Add Backup Key" className="rounded bg-primary px-3 py-1 text-sm text-white disabled:cursor-not-allowed disabled:opacity-60" />
      </div>
      {notice ? <div className="mt-2"><ActionNoticeView notice={notice} /></div> : null}
    </form>
  );
}

/** Form replace 1 key (di dalam <details> KeyBoard). */
export function ReplaceKeyForm({ keyId, providerId }: { keyId: string; providerId: string }) {
  const { notice, run } = useActionForm('Key diganti + failure direset.');
  return (
    <form
      action={async (fd) => {
        if (await run(() => replaceKey(keyId, providerId, fd))) resetForm(`replace-key-${keyId}`);
      }}
      id={`replace-key-${keyId}`}
      className="mt-2"
    >
      <div className="flex gap-1">
        <input name="api_key" type="password" placeholder="sk-..." aria-label="API key pengganti" className="w-40 rounded border border-line px-2 py-1 text-xs" required />
        <PendingButton label="Simpan" />
      </div>
      {notice ? <div className="mt-2"><ActionNoticeView notice={notice} /></div> : null}
    </form>
  );
}

export interface StageModelOption {
  id: string;
  provider_id: string;
  model_id: string;
  display_name: string;
  providerName: string;
}

/** Form default model 1 stage (halaman stages). */
export function StageDefaultForm({
  stage,
  stageLabel,
  currentInfo,
  currentModelId,
  models
}: {
  stage: string;
  stageLabel: string;
  currentInfo: string;
  currentModelId: string;
  models: StageModelOption[];
}) {
  const { notice, run } = useActionForm(`Default ${stageLabel} tersimpan.`);
  return (
    <form action={(fd) => {
      void run(() => upsertStageDefault(fd));
    }} className="rounded-xl border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-ink">{stageLabel}</p>
          <p className="text-xs text-ink-muted">{currentInfo}</p>
        </div>
        <span className="text-xs text-ink-muted">{stage}</span>
      </div>
      <input type="hidden" name="stage" value={stage} />
      <div className="mt-3 flex flex-wrap gap-2">
        <label htmlFor={`stage-model-${stage}`} className="sr-only">Model</label>
        <select key={currentModelId} id={`stage-model-${stage}`} name="model_id" defaultValue={currentModelId} className="min-w-[280px] rounded-lg border border-line bg-background px-3 py-2 text-sm text-ink">
          <option value="">Default global (waterfall)</option>
          {models.map((m) => (
            <option key={m.id} value={m.id}>{m.providerName} · {m.display_name} ({m.model_id})</option>
          ))}
        </select>
        <PendingButton label="Simpan" className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60" />
      </div>
      {notice ? <div className="mt-2"><ActionNoticeView notice={notice} /></div> : null}
    </form>
  );
}
