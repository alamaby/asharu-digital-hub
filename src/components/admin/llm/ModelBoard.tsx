'use client';

import { useTransition } from 'react';
import { reorderModels, toggleModelActive, updateModelReasoning } from '@/lib/admin/llm-actions';
import { SortableList } from './SortableList';

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
  const [pending, startTransition] = useTransition();
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-ink">Models — drag ≡ untuk urutan fallback & RR</h3>
        {pending ? <span className="text-xs text-ink-muted">Menyimpan…</span> : null}
      </div>
      {models.length === 0 ? <p className="text-xs text-ink-muted">Belum ada model.</p> : null}
      <SortableList
        items={models.map((m) => ({ id: m.id }))}
        onReorder={(ids) => startTransition(() => reorderModels(providerId, ids))}
        renderItem={(id) => {
          const m = models.find((x) => x.id === id)!;
          const reasoning = Boolean((m.config as { reasoning?: boolean } | null)?.reasoning);
          return (
            <div className="flex flex-wrap items-center justify-between gap-2">
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
                    checked={reasoning}
                    onChange={(e) => startTransition(() => updateModelReasoning(m.id, providerId, e.target.checked))}
                  />
                  reasoning max
                </label>
                <label className="flex items-center gap-1 text-xs">
                  <input
                    type="checkbox"
                    checked={m.is_active}
                    onChange={(e) => startTransition(() => toggleModelActive(m.id, providerId, e.target.checked))}
                  />
                  aktif
                </label>
              </div>
            </div>
          );
        }}
      />
      <p className="text-xs text-ink-muted">Jika 1 model gagal, lanjut model berikutnya sesuai urutan. Nonaktif = skip.</p>
    </div>
  );
}
