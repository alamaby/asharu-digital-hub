'use client';

import { useState, useTransition } from 'react';
import { generatePostImage } from '@/lib/image/actions';

interface Props {
  draftId: string;
  postIndex: number;
  /** URL selected untuk post ini (bila sudah ada). */
  imageUrl: string | null;
  /** True bila post ini reply afiliasi (pakai gambar produk, generate ditolak). */
  isAffiliate: boolean;
  /** True bila mode per-reply aktif (global/sesi/draf). Cover (0) selalu boleh. */
  perReplyEnabled: boolean;
}

/** Thumbnail + tombol generate per reply (opt-in, skip afiliasi) di dalam kartu post. */
export function PostImageControl({ draftId, postIndex, imageUrl, isAffiliate, perReplyEnabled }: Props) {
  const [notice, setNotice] = useState<string | null>(null);
  const [url] = useState<string | null>(imageUrl);
  const [isPending, startTransition] = useTransition();
  const [imgBroken, setImgBroken] = useState(false);

  if (isAffiliate) return null;

  function enqueue() {
    setNotice('Menyiapkan generate…');
    startTransition(async () => {
      try {
        await generatePostImage(draftId, postIndex);
        setNotice('Masuk antrean. Worker memproses ≤5 menit — refresh halaman untuk melihat hasil.');
      } catch (e) {
        setNotice(e instanceof Error ? `Gagal: ${e.message}` : 'Generate gagal.');
      }
    });
  }

  return (
    <div className="mt-2 border-t border-line/60 pt-2">
      {url && !imgBroken ? (
        <div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt={`Ilustrasi balasan ${postIndex}`}
            className="max-h-48 w-full rounded-lg object-cover"
            loading="lazy"
            onError={() => setImgBroken(true)}
          />
        </div>
      ) : (
        <p className="text-[11px] text-ink-muted">
          {perReplyEnabled || postIndex === 0
            ? 'Belum ada visualisasi untuk post ini.'
            : 'Mode per-reply belum aktif.'}
        </p>
      )}
      {postIndex > 0 && perReplyEnabled ? (
        <button
          type="button"
          onClick={enqueue}
          disabled={isPending}
          className="mt-1 rounded-md border border-line bg-surface px-2 py-1 text-[11px] font-medium text-ink hover:border-primary disabled:opacity-50"
        >
          {isPending ? 'Memproses…' : url ? 'Regenerate visual' : 'Generate visual'}
        </button>
      ) : null}
      {notice ? (
        <p role="status" className="mt-1 text-[11px] text-ink-muted">
          {notice}
        </p>
      ) : null}
    </div>
  );
}
