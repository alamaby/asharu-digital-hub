'use client';

import { useState } from 'react';
import { Link } from '@/i18n/navigation';
import { reorderImageSubjects, toggleSubjectActive } from '@/lib/admin/visual-actions';
import { SortableList } from '../llm/SortableList';
import { ActionNoticeView, type ActionNotice } from '../llm/ActionFeedback';
import type { SubjectRow } from './SubjectForms';

export function SubjectBoard({ subjects }: { subjects: SubjectRow[] }) {
  const [notice, setNotice] = useState<ActionNotice | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function handleReorder(orderedSlugs: string[]) {
    setBusy('reorder');
    setNotice({ type: 'working', message: 'Menyimpan urutan template...' });
    const r = await reorderImageSubjects(orderedSlugs);
    if (!r.ok) throw new Error(r.error ?? 'Gagal menyimpan urutan.');
  }

  function handleSettled(ok: boolean, error?: string) {
    setBusy(null);
    setNotice(ok ? { type: 'success', message: 'Urutan template tersimpan.' } : { type: 'error', message: 'Gagal menyimpan urutan — dikembalikan.', detail: error });
  }

  async function handleToggle(s: SubjectRow, active: boolean) {
    setBusy(s.slug);
    setNotice({ type: 'working', message: `Memproses ${s.display_name}...` });
    try {
      const r = await toggleSubjectActive(s.slug, active);
      setNotice(r.ok
        ? { type: 'success', message: active ? `${s.display_name} diaktifkan.` : `${s.display_name} dinonaktifkan.` }
        : { type: 'error', message: `Gagal mengubah ${s.display_name}.`, detail: r.error });
    } catch (e) {
      setNotice({ type: 'error', message: `Gagal mengubah ${s.display_name}.`, detail: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-ink">Template Subjek — drag ≡ untuk urutan picker</h3>
        {busy === 'reorder' ? <span role="status" className="text-xs text-ink-muted">Menyimpan...</span> : null}
      </div>
      {subjects.length === 0 ? <p className="text-xs text-ink-muted">Belum ada template.</p> : null}
      <SortableList
        items={subjects.map((s) => ({ id: s.slug }))}
        onReorder={handleReorder}
        onSettled={handleSettled}
        renderItem={(id) => {
          const s = subjects.find((x) => x.slug === id)!;
          const rowBusy = busy !== null;
          return (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink">
                  #{s.sort_order} · {s.display_name} <span className="text-xs text-ink-muted">({s.slug})</span>
                </p>
                <p className="line-clamp-1 text-xs text-ink-muted">{s.subject_en}</p>
              </div>
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1 text-xs">
                  <input
                    type="checkbox"
                    checked={s.is_active}
                    disabled={rowBusy}
                    aria-busy={busy === s.slug}
                    onChange={(e) => handleToggle(s, e.target.checked)}
                  />
                  aktif{busy === s.slug ? '...' : ''}
                </label>
                <Link href={{ pathname: '/admin/visual/subjects/[subjectSlug]', params: { subjectSlug: s.slug } }} className="rounded border border-line px-2 py-1 text-xs hover:border-primary">
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
