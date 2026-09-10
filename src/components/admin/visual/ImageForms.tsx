'use client';

import { useState } from 'react';
import {
  addImageBackupKey,
  addImageModel,
  replaceImageKey,
  updateImageProviderAccountId
} from '@/lib/admin/image-admin-actions';
import type { LlmActionResult } from '@/lib/admin/llm-actions';
import { ActionNoticeView, PendingButton, type ActionNotice } from '../llm/ActionFeedback';

function useImageForm(okMessage: string) {
  const [notice, setNotice] = useState<ActionNotice | null>(null);
  async function run(fn: () => Promise<LlmActionResult>): Promise<boolean> {
    setNotice({ type: 'working', message: 'Menyimpan…' });
    try {
      const r = await fn();
      setNotice(r.ok ? { type: 'success', message: okMessage } : { type: 'error', message: 'Gagal menyimpan.', detail: r.error });
      return r.ok;
    } catch (e) {
      setNotice({ type: 'error', message: 'Gagal menyimpan.', detail: e instanceof Error ? e.message : String(e) });
      return false;
    }
  }
  return { notice, run };
}

function resetForm(id: string) {
  (document.getElementById(id) as HTMLFormElement | null)?.reset();
}

/** Editor account_id Cloudflare image (identifier, tampil apa adanya). */
export function ImageAccountForm({ providerId, defaultValue }: { providerId: string; defaultValue: string }) {
  const { notice, run } = useImageForm('Account ID tersimpan.');
  return (
    <form action={(fd) => {
      void run(() => updateImageProviderAccountId(providerId, fd));
    }} className="mt-2 flex max-w-xl flex-wrap items-end gap-2">
      <label className="min-w-[220px] flex-1 text-xs">
        <span className="mb-0.5 block text-ink-muted">Account ID (cloudflare)</span>
        <input name="account_id" defaultValue={defaultValue} placeholder="32 hex char" className="w-full rounded border border-line px-2 py-1 font-mono text-xs" />
      </label>
      <PendingButton label="Simpan ID" />
      {notice ? <div className="w-full"><ActionNoticeView notice={notice} /></div> : null}
    </form>
  );
}

/** Tambah model image ke provider. */
export function AddImageModelForm({ providerId }: { providerId: string }) {
  const { notice, run } = useImageForm('Model image ditambahkan.');
  return (
    <form
      action={async (fd) => {
        if (await run(() => addImageModel(providerId, fd))) resetForm(`add-imodel-${providerId}`);
      }}
      id={`add-imodel-${providerId}`}
      className="mt-3"
    >
      <div className="flex flex-wrap gap-2 rounded-lg border border-dashed border-line p-2">
        <input name="model_id" placeholder="model_id (exact)" aria-label="Model ID" className="min-w-[180px] flex-1 rounded border border-line px-2 py-1 text-xs" required />
        <input name="display_name" placeholder="display_name" aria-label="Display name" className="min-w-[140px] flex-1 rounded border border-line px-2 py-1 text-xs" />
        <PendingButton label="Tambah Model" />
      </div>
      {notice ? <div className="mt-2"><ActionNoticeView notice={notice} /></div> : null}
    </form>
  );
}

/** Tambah backup key image (+ account_id pair untuk cloudflare). */
export function AddImageKeyForm({ providerId, providerSlug }: { providerId: string; providerSlug: string }) {
  const { notice, run } = useImageForm('Backup key image tersimpan ke Vault.');
  const needsAccountId = providerSlug === 'cloudflare';
  return (
    <form
      action={async (fd) => {
        if (await run(() => addImageBackupKey(providerId, fd))) resetForm(`add-ikey-${providerId}`);
      }}
      id={`add-ikey-${providerId}`}
      className="mt-3"
    >
      <div className="flex flex-wrap items-end gap-2 rounded-lg border border-dashed border-line p-2">
        <div className="min-w-[200px] flex-1">
          <label htmlFor={`ikey-${providerId}`} className="text-xs text-ink-muted">Backup key baru</label>
          <input id={`ikey-${providerId}`} name="api_key" type="password" placeholder="api key baru" className="mt-0.5 w-full rounded border border-line px-2 py-1 text-xs" required />
        </div>
        <label className="text-xs">
          <span className="mb-0.5 block text-ink-muted">Label</span>
          <input name="label" defaultValue="backup" className="w-24 rounded border border-line px-2 py-1 text-xs" />
        </label>
        {needsAccountId ? (
          <label className="min-w-[200px] flex-1 text-xs">
            <span className="mb-0.5 block text-ink-muted">Account ID (pair, opsional bila sudah tersimpan)</span>
            <input name="account_id" placeholder="32 hex char" className="w-full rounded border border-line px-2 py-1 font-mono text-xs" />
          </label>
        ) : null}
        <PendingButton label="Add Backup Key" />
      </div>
      {notice ? <div className="mt-2"><ActionNoticeView notice={notice} /></div> : null}
    </form>
  );
}

/** Replace 1 key image. */
export function ReplaceImageKeyForm({ keyId }: { keyId: string }) {
  const { notice, run } = useImageForm('Key diganti + failure direset.');
  return (
    <form
      action={async (fd) => {
        if (await run(() => replaceImageKey(keyId, fd))) resetForm(`replace-ikey-${keyId}`);
      }}
      id={`replace-ikey-${keyId}`}
      className="mt-2"
    >
      <div className="flex gap-1">
        <input name="api_key" type="password" placeholder="api key baru" aria-label="API key pengganti" className="w-40 rounded border border-line px-2 py-1 text-xs" required />
        <PendingButton label="Simpan" />
      </div>
      {notice ? <div className="mt-2"><ActionNoticeView notice={notice} /></div> : null}
    </form>
  );
}
