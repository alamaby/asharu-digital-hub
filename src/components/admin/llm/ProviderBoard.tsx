'use client';

import { useTransition } from 'react';
import { reorderProviders, toggleProviderActive } from '@/lib/admin/llm-actions';
import { SortableList } from './SortableList';
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
  const [pending, startTransition] = useTransition();

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-ink">Provider — drag ≡ untuk ubah urutan (priority)</h2>
        {pending ? <span className="text-xs text-ink-muted">Menyimpan…</span> : null}
      </div>
      <SortableList
        items={providers.map((p) => ({ id: p.id }))}
        onReorder={(ids) => startTransition(() => reorderProviders(ids))}
        renderItem={(id) => {
          const p = providers.find((x) => x.id === id)!;
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
                    onChange={(e) => startTransition(() => toggleProviderActive(p.id, e.target.checked))}
                  />
                  aktif
                </label>
                <Link href={{ pathname: '/admin/llm/[providerId]', params: { providerId: p.id } }} className="rounded border border-line px-2 py-1 text-xs hover:border-primary">
                  Kelola
                </Link>
              </div>
            </div>
          );
        }}
      />
      <p className="text-xs text-ink-muted">Urutan disimpan sebagai priority = (index+1)*10. Fallback berurutan sesuai priority.</p>
    </div>
  );
}
