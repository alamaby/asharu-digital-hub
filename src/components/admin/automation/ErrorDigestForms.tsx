'use client';

import { useState, useTransition } from 'react';
import { updateErrorNotificationConfig } from '@/lib/notifications/actions';
import { ActionNoticeView, type ActionNotice } from '../llm/ActionFeedback';

const inputCls = 'mt-1 w-full rounded-lg border border-line bg-background px-3 py-2 text-sm text-ink';

export interface ErrorDigestConfigRow {
  category: string;
  is_enabled: boolean;
  digest_window_minutes: number;
  notify_emails: string[] | null;
  last_digest_at: string | null;
}

function toNotice(result: { ok: boolean; message?: string; error?: string }, okMsg: string): ActionNotice {
  if (result.ok) return { type: 'success', message: result.message ?? okMsg };
  return { type: 'error', message: 'Gagal menyimpan.', detail: result.error };
}

export function ErrorDigestConfigTable({ rows }: { rows: ErrorDigestConfigRow[] }) {
  const [notice, setNotice] = useState<ActionNotice | null>(null);
  const [, startTransition] = useTransition();

  async function saveRow(row: ErrorDigestConfigRow): Promise<void> {
    const fd = new FormData();
    fd.set('category', row.category);
    fd.set('is_enabled', row.is_enabled ? 'on' : 'off');
    fd.set('digest_window_minutes', String(row.digest_window_minutes));
    fd.set('notify_emails', row.notify_emails?.join(',') ?? '');
    const result = await updateErrorNotificationConfig(fd);
    startTransition(() => {
      setNotice(toNotice(result, `Config ${row.category} tersimpan.`));
    });
  }

  return (
    <div>
      <ActionNoticeView notice={notice} />
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs text-ink-muted">
              <th className="pb-2 pr-4 font-medium">Kategori</th>
              <th className="pb-2 pr-4 font-medium">Aktif</th>
              <th className="pb-2 pr-4 font-medium">Window (menit)</th>
              <th className="pb-2 pr-4 font-medium">Penerima override</th>
              <th className="pb-2 pr-4 font-medium">Last digest</th>
              <th className="pb-2 font-medium">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.category} className="border-b border-line even:bg-background">
                <td className="py-2 pr-4 font-mono text-xs">{row.category}</td>
                <td className="py-2 pr-4">
                  <input
                    type="checkbox"
                    checked={row.is_enabled}
                    onChange={(e) => saveRow({ ...row, is_enabled: e.currentTarget.checked })}
                    className="accent-primary"
                  />
                </td>
                <td className="py-2 pr-4">
                  <input
                    type="number"
                    min={5}
                    max={1440}
                    value={row.digest_window_minutes}
                    onChange={(e) => saveRow({ ...row, digest_window_minutes: Number(e.currentTarget.value) })}
                    className={inputCls}
                  />
                </td>
                <td className="py-2 pr-4">
                  <input
                    type="text"
                    value={row.notify_emails?.join(', ') ?? ''}
                    onChange={(e) => saveRow({ ...row, notify_emails: e.currentTarget.value.trim() ? e.currentTarget.value.split(',').map((s) => s.trim()).filter(Boolean) : null })}
                    placeholder="(warisi global)"
                    className={inputCls}
                  />
                </td>
                <td className="py-2 pr-4 text-xs text-ink-muted">
                  {row.last_digest_at ? new Date(row.last_digest_at).toLocaleString('id-ID') : '—'}
                </td>
                <td className="py-2">
                  <button
                    type="button"
                    onClick={() => saveRow(row)}
                    className="rounded bg-primary px-2 py-1 text-xs text-white disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Simpan
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-ink-muted">
        Email failure langsung telah dimigrasikan ke digest. Ubah konfigurasi di bawah untuk menyesuaikan jendela dan penerima.
      </p>
    </div>
  );
}
