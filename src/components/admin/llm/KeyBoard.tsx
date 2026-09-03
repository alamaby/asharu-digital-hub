'use client';

import { useTransition } from 'react';
import { reorderKeys, toggleKeyActive } from '@/lib/admin/llm-actions';
import { SortableList } from './SortableList';

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
  const [pending, startTransition] = useTransition();
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-ink">Keys — drag ≡ untuk prioritas (0 = utama)</h3>
        {pending ? <span className="text-xs text-ink-muted">Menyimpan…</span> : null}
      </div>
      {keys.length === 0 ? <p className="text-xs text-ink-muted">Belum ada key. Tambah backup key di bawah.</p> : null}
      <SortableList
        items={keys.map((k) => ({ id: k.id }))}
        onReorder={(ids) => startTransition(() => reorderKeys(providerId, ids))}
        renderItem={(id) => {
          const k = keys.find((x) => x.id === id)!;
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
                    onChange={(e) => startTransition(() => toggleKeyActive(k.id, providerId, e.target.checked))}
                  />
                  aktif
                </label>
                <details className="text-xs">
                  <summary className="cursor-pointer rounded border border-line px-2 py-1">Replace</summary>
                  <form action={async (fd) => { const { replaceKey } = await import('@/lib/admin/llm-actions'); await replaceKey(k.id, providerId, fd); }} className="mt-2 flex gap-1">
                    <input name="api_key" type="password" placeholder="sk-..." className="w-40 rounded border border-line px-2 py-1 text-xs" required />
                    <button type="submit" className="rounded bg-primary px-2 py-1 text-xs text-white">Simpan</button>
                  </form>
                </details>
              </div>
            </div>
          );
        }}
      />
    </div>
  );
}
