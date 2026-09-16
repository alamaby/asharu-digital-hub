'use client';

import { useState } from 'react';
import { addCameraAngle, toggleCameraAngleActive, updateCameraAngle } from '@/lib/admin/visual-actions';
import { DISPLAY_NAME_MAX, SLUG_MAX, SUBJECT_EN_MAX, SUBJECT_EN_MIN } from '@/lib/admin/visual-limits';
import { ActionNoticeView, PendingButton, type ActionNotice } from '../llm/ActionFeedback';
import { CharCount } from './CharCount';

export interface CameraAngleRow {
  slug: string;
  display_name: string;
  angle_en: string;
  is_active: boolean;
  sort_order: number;
}

export function AddCameraAngleForm() {
  const [notice, setNotice] = useState<ActionNotice | null>(null);
  const [displayLen, setDisplayLen] = useState(0);
  const [slugLen, setSlugLen] = useState(0);
  const [angleLen, setAngleLen] = useState(0);
  return (
    <form
      action={async (fd) => {
        setNotice({ type: 'working', message: 'Menyimpan...' });
        try {
          const r = await addCameraAngle(fd);
          setNotice(r.ok ? { type: 'success', message: 'Template ditambahkan.' } : { type: 'error', message: 'Gagal menambah.', detail: r.error });
          if (r.ok) {
            (document.getElementById('add-camera-angle') as HTMLFormElement | null)?.reset();
            setDisplayLen(0);
            setSlugLen(0);
            setAngleLen(0);
          }
        } catch (e) {
          setNotice({ type: 'error', message: 'Gagal menambah.', detail: e instanceof Error ? e.message : String(e) });
        }
      }}
      id="add-camera-angle"
      className="rounded-xl border border-dashed border-line bg-surface p-4"
    >
      <p className="text-sm font-semibold text-ink">Tambah template baru</p>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <label className="text-xs">
          <span className="mb-0.5 flex items-center justify-between gap-2">
            <span className="text-ink-muted">Nama tampilan</span>
            <CharCount current={displayLen} max={DISPLAY_NAME_MAX} />
          </span>
          <input name="display_name" placeholder="cth Low-Angle Full-Body" maxLength={DISPLAY_NAME_MAX} onInput={(e) => setDisplayLen(e.currentTarget.value.length)} className="w-full rounded-lg border border-line bg-background px-2 py-1.5 text-sm" required />
        </label>
        <label className="text-xs">
          <span className="mb-0.5 flex items-center justify-between gap-2">
            <span className="text-ink-muted">Slug (opsional, auto dari nama)</span>
            <CharCount current={slugLen} max={SLUG_MAX} />
          </span>
          <input name="slug" placeholder="cth low-angle-full-body" onInput={(e) => setSlugLen(e.currentTarget.value.length)} className="w-full rounded-lg border border-line bg-background px-2 py-1.5 text-sm" />
        </label>
      </div>
      <label className="mt-2 block text-xs">
        <span className="mb-0.5 flex items-center justify-between gap-2">
          <span className="text-ink-muted">Camera angle (EN)</span>
          <CharCount current={angleLen} max={SUBJECT_EN_MAX} min={SUBJECT_EN_MIN} />
        </span>
        <textarea name="angle_en" rows={2} maxLength={SUBJECT_EN_MAX} onInput={(e) => setAngleLen(e.currentTarget.value.length)} placeholder="Low-angle full-body shot ..." className="w-full rounded-lg border border-line bg-background px-2 py-1.5 text-sm" required />
      </label>
      <div className="mt-2">
        <PendingButton label="Tambah Template" className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60" />
      </div>
      {notice ? <div className="mt-2"><ActionNoticeView notice={notice} /></div> : null}
    </form>
  );
}

export function CameraAngleRowForm({ row }: { row: CameraAngleRow }) {
  const [notice, setNotice] = useState<ActionNotice | null>(null);
  const [busy, setBusy] = useState(false);
  const [displayLen, setDisplayLen] = useState(row.display_name.length);
  const [angleLen, setAngleLen] = useState(row.angle_en.length);
  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <form
        action={async (fd) => {
          setNotice({ type: 'working', message: 'Menyimpan...' });
          try {
            const r = await updateCameraAngle(row.slug, fd);
            setNotice(r.ok ? { type: 'success', message: 'Tersimpan.' } : { type: 'error', message: 'Gagal menyimpan.', detail: r.error });
          } catch (e) {
            setNotice({ type: 'error', message: 'Gagal menyimpan.', detail: e instanceof Error ? e.message : String(e) });
          }
        }}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-mono text-sm font-semibold text-ink">{row.slug}</p>
          <label className="flex items-center gap-1 text-xs">
            <input
              type="checkbox"
              checked={row.is_active}
              disabled={busy}
              aria-busy={busy}
              onChange={async (e) => {
                setBusy(true);
                setNotice({ type: 'working', message: 'Memproses...' });
                try {
                  const r = await toggleCameraAngleActive(row.slug, e.target.checked);
                  setNotice(r.ok
                    ? { type: 'success', message: e.target.checked ? 'Template diaktifkan.' : 'Template dinonaktifkan.' }
                    : { type: 'error', message: 'Gagal mengubah status.', detail: r.error });
                } catch (err) {
                  setNotice({ type: 'error', message: 'Gagal mengubah status.', detail: err instanceof Error ? err.message : String(err) });
                } finally {
                  setBusy(false);
                }
              }}
            />
            aktif{busy ? '...' : ''}
          </label>
        </div>
        <label className="mt-2 block text-xs">
          <span className="mb-0.5 flex items-center justify-between gap-2">
            <span className="text-ink-muted">Nama tampilan</span>
            <CharCount current={displayLen} max={DISPLAY_NAME_MAX} />
          </span>
          <input name="display_name" defaultValue={row.display_name} maxLength={DISPLAY_NAME_MAX} onInput={(e) => setDisplayLen(e.currentTarget.value.length)} className="w-full rounded-lg border border-line bg-background px-2 py-1.5 text-sm" required />
        </label>
        <label className="mt-2 block text-xs">
          <span className="mb-0.5 flex items-center justify-between gap-2">
            <span className="text-ink-muted">Camera angle (EN)</span>
            <CharCount current={angleLen} max={SUBJECT_EN_MAX} min={SUBJECT_EN_MIN} />
          </span>
          <textarea name="angle_en" defaultValue={row.angle_en} rows={3} maxLength={SUBJECT_EN_MAX} onInput={(e) => setAngleLen(e.currentTarget.value.length)} className="w-full rounded-lg border border-line bg-background px-2 py-1.5 text-sm" required />
        </label>
        <div className="mt-2">
          <PendingButton label="Simpan" />
        </div>
      </form>
      {notice ? <div className="mt-2"><ActionNoticeView notice={notice} /></div> : null}
    </div>
  );
}
