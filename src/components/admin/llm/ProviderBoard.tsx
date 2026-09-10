'use client';

import { useState } from 'react';
import { reorderProviders, toggleProviderActive } from '@/lib/admin/llm-actions';
import { SortableList } from './SortableList';
import { ActionNoticeView, type ActionNotice } from './ActionFeedback';
import { Link } from '@/i18n/navigation';

interface Provider {
  id: string;
  slug: string;
  display_name: string;
  base_url: string;
  priority: number;
  is_active: boolean;
  modelCount?: number;
  keyCount?: number;
}

export function ProviderBoard({ providers }: { providers: Provider[] }) {
  const [notice, setNotice] = useState<ActionNotice | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function handleReorder(ids: string[]) {
    setBusy('reorder');
    setNotice({ type: 'working', message: 'Menyimpan urutan provider…' });
    const r = await reorderProviders(ids);
    if (!r.ok) throw new Error(r.error);
  }

  function handleSettled(ok: boolean, error?: string) {
    setBusy(null);
    setNotice(
      ok
        ? { type: 'success', message: 'Urutan provider tersimpan.' }
        : { type: 'error', message: 'Gagal menyimpan urutan — dikembalikan.', detail: error }
    );
  }

  async function handleToggle(p: Provider, active: boolean) {
    setBusy(p.id);
    setNotice({ type: 'working', message: `Memproses ${p.display_name}…` });
    try {
      const r = await toggleProviderActive(p.id, active);
      setNotice(
        r.ok
          ? { type: 'success', message: active ? `${p.display_name} diaktifkan.` : `${p.display_name} dinonaktifkan.` }
          : { type: 'error', message: `Gagal mengubah ${p.display_name}.`, detail: r.error }
      );
    } catch (e) {
      setNotice({ type: 'error', message: `Gagal mengubah ${p.display_name}.`, detail: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-ink">Provider — drag ≡ untuk ubah urutan (priority)</h2>
        {busy === 'reorder' ? (
          <span role="status" className="text-xs text-ink-muted">Menyimpan…</span>
        ) : null}
      </div>
      <SortableList
        items={providers.map((p) => ({ id: p.id }))}
        onReorder={handleReorder}
        onSettled={handleSettled}
        renderItem={(id) => {
          const p = providers.find((x) => x.id === id)!;
          const rowBusy = busy !== null;
          return (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink">
                  #{p.priority} · {p.display_name} <span className="text-xs text-ink-muted">({p.slug})</span>
                </p>
                <p className="truncate text-xs text-ink-muted">{p.base_url}</p>
                <p className="text-xs text-ink-muted">
                  {p.modelCount ?? 0} models · {p.keyCount ?? 0} keys
                </p>
              </div>
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1 text-xs">
                  <input
                    type="checkbox"
                    checked={p.is_active}
                    disabled={rowBusy}
                    aria-busy={busy === p.id}
                    onChange={(e) => handleToggle(p, e.target.checked)}
                  />
                  aktif{busy === p.id ? '…' : ''}
                </label>
                <Link href={{ pathname: '/admin/llm/[providerId]', params: { providerId: p.id } }} className="rounded border border-line px-2 py-1 text-xs hover:border-primary">
                  Kelola
                </Link>
              </div>
            </div>
          );
        }}
      />
      <ActionNoticeView notice={notice} />
      <p className="text-xs text-ink-muted">Urutan disimpan sebagai priority = (index+1)*10. Fallback berurutan sesuai priority.</p>
    </div>
  );
}
