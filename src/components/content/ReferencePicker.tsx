'use client';

import { useRef, useState } from 'react';

export interface ReferenceModelOption {
  id: string;
  provider_id: string;
  model_id: string;
  display_name: string;
  provider_slug: string;
  /** True bila model mendukung image reference (flag server, bukan hardcode). */
  supports_reference?: boolean;
}

interface ReferencePickerProps {
  /** Label section (dari parent — tanpa i18n baru, pakai literal ID). */
  title: string;
  /** Draft/history milik post ini — untuk opsi "dari histori". */
  history: { id: string; public_url: string | null; status: string }[];
  /** URL referensi aktif (null = tanpa referensi). */
  referenceUrl: string | null;
  /** Strength aktif 0–1. */
  referenceStrength: number;
  /** Model terpin (UUID) — untuk validasi support. */
  modelUuid: string;
  /** Katalog model aktif (dengan flag support). */
  models: ReferenceModelOption[];
  disabled?: boolean;
  busy?: boolean;
  onUpload: (file: File) => void;
  onSelectUrl: (url: string | null) => void;
  onStrength: (value: number) => void;
  notice: string | null;
}

/**
 * Picker referensi img2img bersama (cover + per-reply): upload file atau
 * pilih dari histori post ini + slider strength. Tanpa mask (fase 2).
 * Model non-support yang terpin memunculkan peringatan inline; Auto
 * dipersempit worker ke model support.
 */
export function ReferencePicker({
  title,
  history,
  referenceUrl,
  referenceStrength,
  modelUuid,
  models,
  disabled = false,
  busy = false,
  onUpload,
  onSelectUrl,
  onStrength,
  notice
}: ReferencePickerProps) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const selected = models.find((m) => m.id === modelUuid) ?? null;
  const unsupported = Boolean(referenceUrl && selected && selected.supports_reference === false);
  const readyHistory = history.filter((h) => h.public_url && (h.status === 'ready' || h.status === 'selected'));

  function pickFile(file: File | undefined) {
    if (!file || disabled || busy) return;
    onUpload(file);
    if (fileRef.current) fileRef.current.value = '';
  }

  return (
    <div
      className={`mt-2 rounded-lg border border-line bg-background p-2 ${dragOver ? 'border-primary' : ''}`}
      onDragOver={(e) => {
        if (disabled || busy) return;
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        if (disabled || busy) return;
        e.preventDefault();
        setDragOver(false);
        pickFile(e.dataTransfer.files?.[0]);
      }}
    >
      <p className="text-[11px] font-medium text-ink">{title}</p>
      <p className="text-[10px] text-ink-muted">Upload JPEG/PNG/WebP ≤5MB atau pilih dari histori. Tanpa mask — inpainting menyusul.</p>
      <div className="mt-1 flex flex-wrap items-center gap-1">
        <label
          htmlFor={`ref-file-${title}`}
          className={`cursor-pointer rounded-md border border-line bg-surface px-2 py-1 text-[11px] font-medium text-ink hover:border-primary ${disabled || busy ? 'pointer-events-none opacity-50' : ''}`}
        >
          {busy ? 'Mengunggah...' : 'Upload referensi'}
        </label>
        <input
          ref={fileRef}
          id={`ref-file-${title}`}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          disabled={disabled || busy}
          onChange={(e) => pickFile(e.target.files?.[0])}
        />
        {readyHistory.length > 0 ? (
          <select
            value={referenceUrl ?? ''}
            onChange={(e) => onSelectUrl(e.target.value || null)}
            disabled={disabled || busy}
            className="rounded-md border border-line bg-surface px-1.5 py-1 text-[11px]"
            aria-label="Referensi dari histori"
          >
            <option value="">(dari histori...)</option>
            {readyHistory.map((h, i) => (
              <option key={h.id} value={h.public_url ?? ''}>
                Hasil {readyHistory.length - i} ({h.status})
              </option>
            ))}
          </select>
        ) : null}
        {referenceUrl ? (
          <button
            type="button"
            onClick={() => onSelectUrl(null)}
            disabled={disabled || busy}
            className="rounded-md border border-line bg-surface px-2 py-1 text-[11px] text-ink-muted hover:border-primary disabled:opacity-50"
          >
            Hapus
          </button>
        ) : null}
      </div>
      {referenceUrl ? (
        <div className="mt-1 flex items-start gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={referenceUrl} alt="Pratinjau referensi" className="h-16 w-16 rounded object-cover" />
          <label className="grid flex-1 gap-0.5 text-[11px]">
            <span className="text-ink-muted">Kekuatan ubah: {referenceStrength.toFixed(2)} (rendah = dekat referensi)</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={referenceStrength}
              onChange={(e) => onStrength(Number(e.target.value))}
              disabled={disabled || busy}
              className="w-full"
              aria-label="Kekuatan ubah referensi"
            />
          </label>
        </div>
      ) : null}
      {unsupported ? (
        <p role="alert" className="mt-1 text-[11px] text-red-600">
          Model {selected?.display_name} tidak mendukung image reference — pilih model bertanda ref atau Auto.
        </p>
      ) : null}
      {referenceUrl && !modelUuid ? (
        <p className="mt-1 text-[10px] text-ink-muted">Auto + referensi: hanya model img2img yang dipakai.</p>
      ) : null}
      {notice ? (
        <p role="status" className="mt-1 text-[11px] text-ink-muted">
          {notice}
        </p>
      ) : null}
    </div>
  );
}
