'use client';

import { useState } from 'react';
import {
  reorderImageKeys,
  reorderImageModels,
  reorderImageProviders,
  toggleImageKeyActive,
  toggleImageModelActive,
  toggleImageProviderActive
} from '@/lib/admin/image-admin-actions';
import { SortableList } from '../llm/SortableList';
import { ActionNoticeView, type ActionNotice } from '../llm/ActionFeedback';
import { Link } from '@/i18n/navigation';
import { AddImageKeyForm, AddImageModelForm, ReplaceImageKeyForm } from './ImageForms';

export interface ImageProvider {
  id: string;
  slug: string;
  display_name: string;
  base_url: string;
  priority: number;
  is_active: boolean;
  config: Record<string, string>;
  modelCount?: number;
  keyCount?: number;
}

export interface ImageModel {
  id: string;
  provider_id: string;
  model_id: string;
  display_name: string;
  priority: number;
  is_active: boolean;
  is_default: boolean;
  usage_count: number;
  last_used_at: string | null;
  config: Record<string, unknown> | null;
}

export interface ImageKey {
  id: string;
  provider_id: string;
  key_hash: string;
  key_suffix: string | null;
  label: string;
  priority: number;
  is_active: boolean;
  usage_count: number;
  failure_count: number;
  last_used_at: string | null;
}

function useBoard(okMessage: string) {
  const [notice, setNotice] = useState<ActionNotice | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  async function runReorder(ids: string[], fn: (ids: string[]) => Promise<{ ok: boolean; error?: string }>) {
    setBusy('reorder');
    setNotice({ type: 'working', message: 'Menyimpan urutan...' });
    const r = await fn(ids);
    if (!r.ok) throw new Error(r.error ?? 'Gagal menyimpan urutan.');
  }
  function settled(ok: boolean, error?: string) {
    setBusy(null);
    setNotice(ok ? { type: 'success', message: okMessage } : { type: 'error', message: 'Gagal menyimpan urutan — dikembalikan.', detail: error });
  }
  return { notice, setNotice, busy, setBusy, runReorder, settled };
}

export function ImageProviderBoard({ providers }: { providers: ImageProvider[] }) {
  const { notice, setNotice, busy, setBusy, runReorder, settled } = useBoard('Urutan provider image tersimpan.');

  async function handleToggle(p: ImageProvider, active: boolean) {
    setBusy(p.id);
    setNotice({ type: 'working', message: `Memproses ${p.display_name}...` });
    try {
      const r = await toggleImageProviderActive(p.id, active);
      setNotice(r.ok
        ? { type: 'success', message: active ? `${p.display_name} diaktifkan.` : `${p.display_name} dinonaktifkan.` }
        : { type: 'error', message: `Gagal mengubah ${p.display_name}.`, detail: r.error });
    } catch (e) {
      setNotice({ type: 'error', message: `Gagal mengubah ${p.display_name}.`, detail: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-ink">Provider Image — drag ≡ untuk urutan waterfall</h3>
        {busy === 'reorder' ? <span role="status" className="text-xs text-ink-muted">Menyimpan...</span> : null}
      </div>
      <SortableList
        items={providers.map((p) => ({ id: p.id }))}
        onReorder={(ids) => runReorder(ids, reorderImageProviders)}
        onSettled={settled}
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
                <p className="text-xs text-ink-muted">{p.modelCount ?? 0} models · {p.keyCount ?? 0} keys</p>
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
                  aktif{busy === p.id ? '...' : ''}
                </label>
                <Link href={{ pathname: '/admin/visual/[providerId]', params: { providerId: p.id } }} className="rounded border border-line px-2 py-1 text-xs hover:border-primary">
                  Kelola
                </Link>
              </div>
            </div>
          );
        }}
      />
      <ActionNoticeView notice={notice} />
    </div>
  );
}

export function ImageModelBoard({ providerId, providerName, models }: { providerId: string; providerName: string; models: ImageModel[] }) {
  const { notice, setNotice, busy, setBusy, runReorder, settled } = useBoard(`Urutan model ${providerName} tersimpan.`);

  async function handleToggle(m: ImageModel, active: boolean) {
    setBusy(m.id);
    setNotice({ type: 'working', message: `Memproses ${m.model_id}...` });
    try {
      const r = await toggleImageModelActive(m.id, providerId, active);
      setNotice(r.ok
        ? { type: 'success', message: active ? `${m.model_id} diaktifkan.` : `${m.model_id} dinonaktifkan.` }
        : { type: 'error', message: `Gagal mengubah ${m.model_id}.`, detail: r.error });
    } catch (e) {
      setNotice({ type: 'error', message: `Gagal mengubah ${m.model_id}.`, detail: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-ink">Models — drag ≡ untuk urutan fallback</h3>
        {busy === 'reorder' ? <span role="status" className="text-xs text-ink-muted">Menyimpan...</span> : null}
      </div>
      {models.length === 0 ? <p className="text-xs text-ink-muted">Belum ada model.</p> : null}
      <SortableList
        items={models.map((m) => ({ id: m.id }))}
        onReorder={(ids) => runReorder(ids, (list) => reorderImageModels(providerId, list))}
        onSettled={settled}
        renderItem={(id) => {
          const m = models.find((x) => x.id === id)!;
          const rowBusy = busy !== null;
          return (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm text-ink">
                  #{m.priority} · {m.model_id} <span className="text-xs text-ink-muted">— {m.display_name}{m.is_default ? ' (default)' : ''}</span>
                </p>
                <p className="text-xs text-ink-muted">used {m.usage_count} · last {m.last_used_at ? new Date(m.last_used_at).toLocaleString('id-ID') : '—'}</p>
              </div>
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1 text-xs">
                  <input
                    type="checkbox"
                    checked={m.is_active}
                    disabled={rowBusy}
                    aria-busy={busy === m.id}
                    onChange={(e) => handleToggle(m, e.target.checked)}
                  />
                  aktif{busy === m.id ? '...' : ''}
                </label>
                <Link
                  href={{ pathname: '/admin/visual/[providerId]/models/[modelId]', params: { providerId, modelId: m.id } }}
                  className="rounded border border-line px-2 py-1 text-xs hover:border-primary"
                >
                  Detail
                </Link>
              </div>
            </div>
          );
        }}
      />
      <AddImageModelForm providerId={providerId} />
      <ActionNoticeView notice={notice} />
    </div>
  );
}

export function ImageKeyBoard({ providerId, providerName, providerSlug, keys }: { providerId: string; providerName: string; providerSlug: string; keys: ImageKey[] }) {
  const { notice, setNotice, busy, setBusy, runReorder, settled } = useBoard(`Urutan key ${providerName} tersimpan.`);

  async function handleToggle(k: ImageKey, active: boolean) {
    setBusy(k.id);
    setNotice({ type: 'working', message: `Memproses key ${k.key_hash}...` });
    try {
      const r = await toggleImageKeyActive(k.id, providerId, active);
      setNotice(r.ok
        ? { type: 'success', message: active ? `Key ${k.key_hash} diaktifkan (failure direset).` : `Key ${k.key_hash} dinonaktifkan.` }
        : { type: 'error', message: `Gagal mengubah key ${k.key_hash}.`, detail: r.error });
    } catch (e) {
      setNotice({ type: 'error', message: `Gagal mengubah key ${k.key_hash}.`, detail: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-ink">Keys — drag ≡ untuk urutan fallback</h3>
        {busy === 'reorder' ? <span role="status" className="text-xs text-ink-muted">Menyimpan...</span> : null}
      </div>
      {keys.length === 0 ? <p className="text-xs text-ink-muted">Belum ada key.</p> : null}
      <SortableList
        items={keys.map((k) => ({ id: k.id }))}
        onReorder={(ids) => runReorder(ids, (list) => reorderImageKeys(providerId, list))}
        onSettled={settled}
        renderItem={(id) => {
          const k = keys.find((x) => x.id === id)!;
          const rowBusy = busy !== null;
          return (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-mono text-ink">#{k.priority} · {k.key_hash} <span className="text-xs text-ink-muted">...{k.key_suffix ?? '????'} · {k.label}</span></p>
                <p className="text-xs text-ink-muted">used {k.usage_count} · fail {k.failure_count}</p>
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
                  aktif{busy === k.id ? '...' : ''}
                </label>
                <details className="text-xs">
                  <summary className="cursor-pointer rounded border border-line px-2 py-1">Replace</summary>
                  <ReplaceImageKeyForm keyId={k.id} />
                </details>
              </div>
            </div>
          );
        }}
      />
      <AddImageKeyForm providerId={providerId} providerSlug={providerSlug} />
      <ActionNoticeView notice={notice} />
    </div>
  );
}
