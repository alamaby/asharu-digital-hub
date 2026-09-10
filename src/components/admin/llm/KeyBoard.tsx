'use client';

import { useState } from 'react';
import { reorderKeys, toggleKeyActive } from '@/lib/admin/llm-actions';
import { SortableList } from './SortableList';
import { ActionNoticeView, type ActionNotice } from './ActionFeedback';
import { ReplaceKeyForm } from './LlmForms';

interface KeyRow {
  id: string;
  key_hash: string;
  priority: number;
  is_active: boolean;
  usage_count: number;
  failure_count: number;
  last_used_at: string | null;
  vault_secret_id: string | null;
}

export function KeyBoard({ providerId, keys }: { providerId: string; keys: KeyRow[] }) {
  const [notice, setNotice] = useState<ActionNotice | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function handleReorder(ids: string[]) {
    setBusy('reorder');
    setNotice({ type: 'working', message: 'Menyimpan urutan key…' });
    const r = await reorderKeys(providerId, ids);
    if (!r.ok) throw new Error(r.error);
  }

  function handleSettled(ok: boolean, error?: string) {
    setBusy(null);
    setNotice(
      ok
        ? { type: 'success', message: 'Urutan key tersimpan.' }
        : { type: 'error', message: 'Gagal menyimpan urutan — dikembalikan.', detail: error }
    );
  }

  async function handleToggle(k: KeyRow, active: boolean) {
    setBusy(k.id);
    setNotice({ type: 'working', message: `Memproses key ${k.key_hash}…` });
    try {
      const r = await toggleKeyActive(k.id, providerId, active);
      setNotice(
        r.ok
          ? { type: 'success', message: active ? `Key ${k.key_hash} diaktifkan (failure direset).` : `Key ${k.key_hash} dinonaktifkan.` }
          : { type: 'error', message: `Gagal mengubah key ${k.key_hash}.`, detail: r.error }
      );
    } catch (e) {
      setNotice({ type: 'error', message: `Gagal mengubah key ${k.key_hash}.`, detail: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-ink">Keys — drag ≡ untuk prioritas (0 = utama)</h3>
        {busy === 'reorder' ? (
          <span role="status" className="text-xs text-ink-muted">Menyimpan…</span>
        ) : null}
      </div>
      {keys.length === 0 ? <p className="text-xs text-ink-muted">Belum ada key. Tambah backup key di bawah.</p> : null}
      <SortableList
        items={keys.map((k) => ({ id: k.id }))}
        onReorder={handleReorder}
        onSettled={handleSettled}
        renderItem={(id) => {
          const k = keys.find((x) => x.id === id)!;
          const rowBusy = busy !== null;
          return (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-mono text-ink">#{k.priority} · {k.key_hash} <span className="text-xs text-ink-muted">({k.vault_secret_id ? k.vault_secret_id.slice(0, 8) + '…' : 'no vault'})</span></p>
                <p className="text-xs text-ink-muted">used {k.usage_count} · fail {k.failure_count} · last {k.last_used_at ? new Date(k.last_used_at).toLocaleString('id-ID') : '—'}</p>
              </div>
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1 text-xs">
                  <input
                    type="checkbox"
                    checked={k.is_active}
                    disabled={rowBusy}
                    aria-busy={busy === k.id}
                    onChange={(e) => handleToggle(k, e.target.checked)}
                  />
                  aktif{busy === k.id ? '…' : ''}
                </label>
                <details className="text-xs">
                  <summary className="cursor-pointer rounded border border-line px-2 py-1">Replace</summary>
                  <ReplaceKeyForm keyId={k.id} providerId={providerId} />
                </details>
              </div>
            </div>
          );
        }}
      />
      <ActionNoticeView notice={notice} />
    </div>
  );
}
