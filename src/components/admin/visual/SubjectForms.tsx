'use client';

import { useState } from 'react';
import { addSubject, toggleSubjectActive, updateSubject } from '@/lib/admin/visual-actions';
import { DISPLAY_NAME_MAX, SLUG_MAX, SUBJECT_EN_MAX, SUBJECT_EN_MIN } from '@/lib/admin/visual-limits';
import { ActionNoticeView, PendingButton, type ActionNotice } from '../llm/ActionFeedback';
import { CharCount } from './CharCount';

export interface SubjectRow {
  slug: string;
  display_name: string;
  subject_en: string;
  is_active: boolean;
  sort_order: number;
}

export function AddSubjectForm() {
  const [notice, setNotice] = useState<ActionNotice | null>(null);
  const [displayLen, setDisplayLen] = useState(0);
  const [slugLen, setSlugLen] = useState(0);
  const [subjectLen, setSubjectLen] = useState(0);
  return (
    <form
      action={async (fd) => {
        setNotice({ type: 'working', message: 'Menyimpan…' });
        try {
          const r = await addSubject(fd);
          setNotice(r.ok ? { type: 'success', message: 'Template ditambahkan.' } : { type: 'error', message: 'Gagal menambah.', detail: r.error });
          if (r.ok) {
            (document.getElementById('add-subject') as HTMLFormElement | null)?.reset();
            setDisplayLen(0);
            setSlugLen(0);
            setSubjectLen(0);
          }
        } catch (e) {
          setNotice({ type: 'error', message: 'Gagal menambah.', detail: e instanceof Error ? e.message : String(e) });
        }
      }}
      id="add-subject"
      className="rounded-xl border border-dashed border-line bg-surface p-4"
    >
      <p className="text-sm font-semibold text-ink">Tambah template baru</p>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <label className="text-xs">
          <span className="mb-0.5 flex items-center justify-between gap-2">
            <span className="text-ink-muted">Nama tampilan</span>
            <CharCount current={displayLen} max={DISPLAY_NAME_MAX} />
          </span>
          <input name="display_name" placeholder="cth Wanita Karier" maxLength={DISPLAY_NAME_MAX} onInput={(e) => setDisplayLen(e.currentTarget.value.length)} className="w-full rounded-lg border border-line bg-background px-2 py-1.5 text-sm" required />
        </label>
        <label className="text-xs">
          <span className="mb-0.5 flex items-center justify-between gap-2">
            <span className="text-ink-muted">Slug (opsional, auto dari nama)</span>
            <CharCount current={slugLen} max={SLUG_MAX} />
          </span>
          <input name="slug" placeholder="cth wanita-karier" onInput={(e) => setSlugLen(e.currentTarget.value.length)} className="w-full rounded-lg border border-line bg-background px-2 py-1.5 text-sm" />
        </label>
      </div>
      <label className="mt-2 block text-xs">
        <span className="mb-0.5 flex items-center justify-between gap-2">
          <span className="text-ink-muted">Subject (EN)</span>
          <CharCount current={subjectLen} max={SUBJECT_EN_MAX} min={SUBJECT_EN_MIN} />
        </span>
        <textarea name="subject_en" rows={2} maxLength={SUBJECT_EN_MAX} onInput={(e) => setSubjectLen(e.currentTarget.value.length)} placeholder="A beautiful young woman ..." className="w-full rounded-lg border border-line bg-background px-2 py-1.5 text-sm" required />
      </label>
      <div className="mt-2">
        <PendingButton label="Tambah Template" className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60" />
      </div>
      {notice ? <div className="mt-2"><ActionNoticeView notice={notice} /></div> : null}
    </form>
  );
}

export function SubjectRowForm({ row }: { row: SubjectRow }) {
  const [notice, setNotice] = useState<ActionNotice | null>(null);
  const [busy, setBusy] = useState(false);
  const [displayLen, setDisplayLen] = useState(row.display_name.length);
  const [subjectLen, setSubjectLen] = useState(row.subject_en.length);
  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <form
        action={async (fd) => {
          setNotice({ type: 'working', message: 'Menyimpan…' });
          try {
            const r = await updateSubject(row.slug, fd);
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
                setNotice({ type: 'working', message: 'Memproses…' });
                try {
                  const r = await toggleSubjectActive(row.slug, e.target.checked);
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
            aktif{busy ? '…' : ''}
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
            <span className="text-ink-muted">Subject (EN)</span>
            <CharCount current={subjectLen} max={SUBJECT_EN_MAX} min={SUBJECT_EN_MIN} />
          </span>
          <textarea name="subject_en" defaultValue={row.subject_en} rows={3} maxLength={SUBJECT_EN_MAX} onInput={(e) => setSubjectLen(e.currentTarget.value.length)} className="w-full rounded-lg border border-line bg-background px-2 py-1.5 text-sm" required />
        </label>
        <div className="mt-2">
          <PendingButton label="Simpan" />
        </div>
      </form>
      {notice ? <div className="mt-2"><ActionNoticeView notice={notice} /></div> : null}
    </div>
  );
}
