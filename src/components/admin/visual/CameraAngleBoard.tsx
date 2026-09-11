'use client';

import { useState } from 'react';
import { Link } from '@/i18n/navigation';
import { reorderCameraAngles, toggleCameraAngleActive } from '@/lib/admin/visual-actions';
import { SortableList } from '../llm/SortableList';
import { ActionNoticeView, type ActionNotice } from '../llm/ActionFeedback';
import type { CameraAngleRow } from './CameraAngleForms';

export function CameraAngleBoard({ angles }: { angles: CameraAngleRow[] }) {
  const [notice, setNotice] = useState<ActionNotice | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function handleReorder(orderedSlugs: string[]) {
    setBusy('reorder');
    setNotice({ type: 'working', message: 'Menyimpan urutan angle...' });
    const r = await reorderCameraAngles(orderedSlugs);
    if (!r.ok) throw new Error(r.error ?? 'Gagal menyimpan urutan.');
  }

  function handleSettled(ok: boolean, error?: string) {
    setBusy(null);
    setNotice(ok ? { type: 'success', message: 'Urutan angle tersimpan.' } : { type: 'error', message: 'Gagal menyimpan urutan — dikembalikan.', detail: error });
  }

  async function handleToggle(a: CameraAngleRow, active: boolean) {
    setBusy(a.slug);
    setNotice({ type: 'working', message: `Memproses ${a.display_name}...` });
    try {
      const r = await toggleCameraAngleActive(a.slug, active);
      setNotice(r.ok
        ? { type: 'success', message: active ? `${a.display_name} diaktifkan.` : `${a.display_name} dinonaktifkan.` }
        : { type: 'error', message: `Gagal mengubah ${a.display_name}.`, detail: r.error });
    } catch (e) {
      setNotice({ type: 'error', message: `Gagal mengubah ${a.display_name}.`, detail: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-ink">Template Camera Angle — drag ≡ untuk urutan picker</h3>
        {busy === 'reorder' ? <span role="status" className="text-xs text-ink-muted">Menyimpan...</span> : null}
      </div>
      {angles.length === 0 ? <p className="text-xs text-ink-muted">Belum ada template.</p> : null}
      <SortableList
        items={angles.map((a) => ({ id: a.slug }))}
        onReorder={handleReorder}
        onSettled={handleSettled}
        renderItem={(id) => {
          const a = angles.find((x) => x.slug === id)!;
          const rowBusy = busy !== null;
          return (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink">
                  #{a.sort_order} · {a.display_name} <span className="text-xs text-ink-muted">({a.slug})</span>
                </p>
                <p className="line-clamp-1 text-xs text-ink-muted">{a.angle_en}</p>
              </div>
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1 text-xs">
                  <input
                    type="checkbox"
                    checked={a.is_active}
                    disabled={rowBusy}
                    aria-busy={busy === a.slug}
                    onChange={(e) => handleToggle(a, e.target.checked)}
                  />
                  aktif{busy === a.slug ? '...' : ''}
                </label>
                <Link href={{ pathname: '/admin/visual/angles/[angleSlug]', params: { angleSlug: a.slug } }} className="rounded border border-line px-2 py-1 text-xs hover:border-primary">
                  Detail
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
