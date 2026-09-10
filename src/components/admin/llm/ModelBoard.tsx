'use client';

import { useState } from 'react';
import { reorderModels, toggleModelActive } from '@/lib/admin/llm-actions';
import { SortableList } from './SortableList';
import { ActionNoticeView, type ActionNotice } from './ActionFeedback';
import { ModelConfigForm } from './LlmForms';

interface Model {
  id: string;
  model_id: string;
  display_name: string;
  priority: number;
  is_active: boolean;
  config: Record<string, unknown> | null;
  usage_count?: number;
  last_used_at?: string | null;
}

export function ModelBoard({ providerId, models }: { providerId: string; models: Model[] }) {
  const [notice, setNotice] = useState<ActionNotice | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function handleReorder(ids: string[]) {
    setBusy('reorder');
    setNotice({ type: 'working', message: 'Menyimpan urutan model…' });
    const r = await reorderModels(providerId, ids);
    if (!r.ok) throw new Error(r.error);
  }

  function handleSettled(ok: boolean, error?: string) {
    setBusy(null);
    setNotice(
      ok
        ? { type: 'success', message: 'Urutan model tersimpan.' }
        : { type: 'error', message: 'Gagal menyimpan urutan — dikembalikan.', detail: error }
    );
  }

  async function handleToggle(m: Model, active: boolean) {
    setBusy(m.id);
    setNotice({ type: 'working', message: `Memproses ${m.model_id}…` });
    try {
      const r = await toggleModelActive(m.id, providerId, active);
      setNotice(
        r.ok
          ? { type: 'success', message: active ? `${m.model_id} diaktifkan.` : `${m.model_id} dinonaktifkan.` }
          : { type: 'error', message: `Gagal mengubah ${m.model_id}.`, detail: r.error }
      );
    } catch (e) {
      setNotice({ type: 'error', message: `Gagal mengubah ${m.model_id}.`, detail: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-ink">Models — drag ≡ untuk urutan fallback & RR</h3>
        {busy === 'reorder' ? (
          <span role="status" className="text-xs text-ink-muted">Menyimpan…</span>
        ) : null}
      </div>
      {models.length === 0 ? <p className="text-xs text-ink-muted">Belum ada model.</p> : null}
      <SortableList
        items={models.map((m) => ({ id: m.id }))}
        onReorder={handleReorder}
        onSettled={handleSettled}
        renderItem={(id) => {
          const m = models.find((x) => x.id === id)!;
          const cfg = (m.config ?? {}) as Record<string, unknown>;
          const rowBusy = busy !== null;
          return (
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink">
                  #{m.priority} · {m.model_id} <span className="text-xs text-ink-muted">— {m.display_name}</span>
                </p>
                <p className="text-xs text-ink-muted">used {m.usage_count ?? 0} · last {m.last_used_at ? new Date(m.last_used_at).toLocaleString('id-ID') : '—'}</p>
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
                  aktif{busy === m.id ? '…' : ''}
                </label>
              </div>
              <ModelConfigForm
                modelId={m.id}
                providerId={providerId}
                defaults={{
                  effort: cfg.reasoning === false ? 'off' : String(cfg.reasoning_effort ?? 'max'),
                  budget: cfg.thinking_budget != null ? String(cfg.thinking_budget) : '',
                  level: cfg.thinking_level != null ? String(cfg.thinking_level) : '',
                  temperature: cfg.temperature != null ? String(cfg.temperature) : '',
                  maxTokens: cfg.max_tokens != null ? String(cfg.max_tokens) : ''
                }}
              />
            </div>
          );
        }}
      />
      <ActionNoticeView notice={notice} />
      <p className="text-xs text-ink-muted">Jika 1 model gagal, lanjut model berikutnya sesuai urutan. Nonaktif = skip.</p>
    </div>
  );
}
