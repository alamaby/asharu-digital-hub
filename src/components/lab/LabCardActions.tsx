'use client';

import { useState } from 'react';
import { Download, Share2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

interface Props {
  batchId: string;
}

/**
 * Unduh kartu share 1080×1080 (PNG dari `/api/lab/[batchId]/card`) + bagikan
 * via Web Share API bila didukung. URL kartu login-gated: share = unduh lalu
 * unggah manual ke sosmed (crawler tak lewat login).
 */
export function LabCardActions({ batchId }: Props) {
  const t = useTranslations('lab.detail');
  const [busy, setBusy] = useState<'idle' | 'working' | 'ready'>('idle');
  const [notice, setNotice] = useState<string | null>(null);

  const fileName = `chat-lab-${batchId.slice(0, 8)}.png`;

  async function fetchPng(): Promise<Blob> {
    const res = await fetch(`/api/lab/${batchId}/card`);
    if (!res.ok) throw new Error(`Kartu gagal dibuat (HTTP ${res.status}).`);
    return res.blob();
  }

  function saveBlob(blob: Blob) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  async function handleDownload() {
    setBusy('working');
    setNotice(t('downloadingCard'));
    try {
      saveBlob(await fetchPng());
      setBusy('ready');
      setNotice(t('cardReady'));
    } catch (e) {
      setBusy('idle');
      setNotice(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleShare() {
    setBusy('working');
    setNotice(t('downloadingCard'));
    try {
      const blob = await fetchPng();
      const file = new File([blob], fileName, { type: 'image/png' });
      if (typeof navigator.share === 'function' && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Chat Lab' });
        setBusy('ready');
        setNotice(null);
      } else {
        saveBlob(blob);
        setBusy('ready');
        setNotice(t('cardReady'));
      }
    } catch (e) {
      // Abort share (user batal) bukan error.
      if (e instanceof DOMException && e.name === 'AbortError') {
        setBusy('idle');
        setNotice(null);
        return;
      }
      setBusy('idle');
      setNotice(e instanceof Error ? e.message : String(e));
    }
  }

  const working = busy === 'working';

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={handleDownload}
        disabled={working}
        className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        <Download className="size-4" aria-hidden />
        {working ? t('downloadingCard') : t('downloadCard')}
      </button>
      <button
        type="button"
        onClick={handleShare}
        disabled={working}
        className="inline-flex items-center gap-1.5 rounded-md border border-line px-3 py-2 text-sm text-ink hover:text-primary disabled:opacity-50"
      >
        <Share2 className="size-4" aria-hidden />
        {t('shareCard')}
      </button>
      {notice ? (
        <p role="status" className="w-full text-xs text-ink-muted">
          {notice}
        </p>
      ) : null}
    </div>
  );
}
