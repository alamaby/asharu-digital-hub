'use client';

import { useTransition } from 'react';
import { reorderModels, toggleModelActive, updateModelConfig } from '@/lib/admin/llm-actions';
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
          const cfg = (m.config ?? {}) as Record<string, unknown>;
          const effort = cfg.reasoning === false ? 'off' : String(cfg.reasoning_effort ?? 'max');
          const budget = cfg.thinking_budget != null ? String(cfg.thinking_budget) : '';
          const level = cfg.thinking_level != null ? String(cfg.thinking_level) : '';
          const temp = cfg.temperature != null ? String(cfg.temperature) : '';
          const maxT = cfg.max_tokens != null ? String(cfg.max_tokens) : '';
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
                    onChange={(e) => startTransition(() => toggleModelActive(m.id, providerId, e.target.checked))}
                  />
                  aktif
                </label>
              </div>
              <form
                action={updateModelConfig.bind(null, m.id, providerId)}
                className="flex w-full flex-wrap items-end gap-2 rounded-lg bg-canvas p-2 text-xs"
              >
                <label className="flex flex-col gap-0.5">
                  <span className="text-ink-muted">reasoning</span>
                  <select name="reasoning_effort" defaultValue={effort} className="rounded border border-line px-1 py-0.5">
                    <option value="off">off</option>
                    <option value="low">low</option>
                    <option value="medium">medium</option>
                    <option value="high">high</option>
                    <option value="max">max</option>
                  </select>
                </label>
                <label className="flex flex-col gap-0.5">
                  <span className="text-ink-muted">thinking_budget</span>
                  <input name="thinking_budget" defaultValue={budget} placeholder="cth 2048" inputMode="numeric" className="w-24 rounded border border-line px-1 py-0.5" />
                </label>
                <label className="flex flex-col gap-0.5">
                  <span className="text-ink-muted">thinking_level</span>
                  <select name="thinking_level" defaultValue={level} className="rounded border border-line px-1 py-0.5">
                    <option value="">—</option>
                    <option value="MINIMAL">MINIMAL</option>
                    <option value="LOW">LOW</option>
                    <option value="MEDIUM">MEDIUM</option>
                    <option value="HIGH">HIGH</option>
                  </select>
                </label>
                <label className="flex flex-col gap-0.5">
                  <span className="text-ink-muted">temperature</span>
                  <input name="temperature" defaultValue={temp} placeholder="0–2" inputMode="decimal" className="w-16 rounded border border-line px-1 py-0.5" />
                </label>
                <label className="flex flex-col gap-0.5">
                  <span className="text-ink-muted">max_tokens</span>
                  <input name="max_tokens" defaultValue={maxT} placeholder="cth 4000" inputMode="numeric" className="w-24 rounded border border-line px-1 py-0.5" />
                </label>
                <button type="submit" className="rounded bg-primary px-2 py-1 text-xs text-white">Simpan</button>
              </form>
            </div>
          );
        }}
      />
      <p className="text-xs text-ink-muted">Jika 1 model gagal, lanjut model berikutnya sesuai urutan. Nonaktif = skip.</p>
    </div>
  );
}
