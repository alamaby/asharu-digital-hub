'use client';

interface ProviderOpt { id: string; slug: string; display_name: string; }
interface ModelOpt { id: string; provider_id: string; model_id: string; display_name: string; priority: number; config: Record<string, unknown> | null; }

interface Props {
  stage: string;
  label: string;
  providers: ProviderOpt[];
  models: ModelOpt[];
  providerId: string;
  modelId: string;
  onProviderChange: (v: string) => void;
  onModelChange: (v: string) => void;
  disabled?: boolean;
}

export function StageModelPicker({ label, providers, models, providerId, modelId, onProviderChange, onModelChange, disabled }: Props) {
  const filteredModels = providerId ? models.filter((m) => m.provider_id === providerId) : [];

  return (
    <div className="rounded-lg border border-line bg-background px-3 py-3">
      <p className="text-xs font-semibold text-ink-muted">{label}</p>
      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div>
          <label className="block text-[11px] font-medium text-ink-muted">Provider</label>
          <select
            value={providerId}
            onChange={(e) => { onProviderChange(e.target.value); onModelChange(''); }}
            disabled={disabled}
            className="mt-1 block w-full rounded-lg border border-line bg-surface px-2 py-1.5 text-xs text-ink disabled:opacity-60"
          >
            <option value="">Default global</option>
            {providers.map((p) => (
              <option key={p.id} value={p.id}>{p.display_name} ({p.slug})</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[11px] font-medium text-ink-muted">Model</label>
          <select
            value={modelId}
            onChange={(e) => onModelChange(e.target.value)}
            disabled={disabled || !providerId}
            className="mt-1 block w-full rounded-lg border border-line bg-surface px-2 py-1.5 text-xs text-ink disabled:opacity-60"
          >
            <option value="">Default global</option>
            {filteredModels.map((m) => (
              <option key={m.id} value={m.id}>{m.display_name} · {m.model_id}{m.config?.reasoning ? ' · reasoning' : ''}</option>
            ))}
          </select>
        </div>
      </div>
      {providerId && filteredModels.length === 0 ? (
        <p className="mt-1 text-[11px] text-amber-600">Tidak ada model aktif untuk provider ini.</p>
      ) : null}
    </div>
  );
}
