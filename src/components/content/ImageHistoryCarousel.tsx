'use client';

import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import useEmblaCarousel from 'embla-carousel-react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { DraftImageRow } from '@/lib/image/types';
import { requestedImageModelUuid } from '@/lib/image/requested-label';

export type ImageCarouselVariant = 'cover' | 'reply';

interface Props {
  /** Riwayat gambar satu post_index (terbaru dulu — urutan query DB desc). */
  rows: DraftImageRow[];
  /** Image terpilih (cover social) — slide terkait diberi badge Terpilih. */
  selectedId: string | null;
  variant?: ImageCarouselVariant;
  isPending?: boolean;
  onSelect?: (imageId: string) => void;
  onRetry?: (imageId: string) => void;
  /** Dipanggil saat user memakai hasil sebagai referensi img2img (public_url). */
  onUseAsReference?: (publicUrl: string) => void;
  /** Katalog model aktif — untuk label request saat antre (bukan "auto"). */
  modelOptions?: { id: string; provider_id: string; model_id: string; display_name: string; provider_slug: string }[];
}

const STATUS_BADGE: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-800',
  prompt_ready: 'bg-violet-100 text-violet-800',
  ready: 'bg-sky-100 text-sky-800',
  selected: 'bg-emerald-100 text-emerald-800',
  failed: 'bg-red-100 text-red-800'
};

function placeholderFor(img: DraftImageRow, imageBroken: boolean): { cls: string; text: string } {
  if (img.status === 'failed') {
    return {
      cls: 'border-red-300 bg-red-50 text-red-700',
      text: img.last_error ? `Error: ${img.last_error}` : 'Generate gagal — tekan Ulangi.'
    };
  }
  if (img.status === 'prompt_ready') {
    return {
      cls: 'border-violet-300 bg-violet-50 text-violet-700',
      text: 'Draf prompt otomatis siap — cek textarea, edit bila perlu, lalu Generate (belum dirender).'
    };
  }
  if (img.status === 'pending') {
    return {
      cls: 'border-amber-300 bg-amber-50 text-amber-800',
      text: 'Masuk antrean — worker cron memproses ≤5 menit. Tekan Muat ulang untuk cek hasil.'
    };
  }
  if (imageBroken) {
    return { cls: 'border-line bg-background text-ink-muted', text: 'Gambar gagal dimuat — buka via Lihat untuk cek URL.' };
  }
  return { cls: 'border-line bg-background text-ink-muted', text: 'Belum ada gambar.' };
}

/** Label provider·model: hasil aktual bila slug terisi; request pin + "(antre)"
 *  bila masih antre dengan override manual; "auto · auto" untuk Auto murni. */
function providerModelLabel(img: DraftImageRow, modelOptions?: Props['modelOptions']): string {
  if (img.provider_slug || img.model_id) {
    return `${img.provider_slug || 'auto'} · ${img.model_id || 'auto'}${img.style_slug ? ` · ${img.style_slug}` : ''}`;
  }
  const uuid = requestedImageModelUuid({
    provider_slug: img.provider_slug,
    model_id: img.model_id,
    llm_meta: img.llm_meta
  });
  const model = uuid ? modelOptions?.find((m) => m.id === uuid) : undefined;
  if (!model) {
    return `auto · auto${img.style_slug ? ` · ${img.style_slug}` : ''}`;
  }
  return `${model.provider_slug} · ${model.model_id} (antre)${img.style_slug ? ` · ${img.style_slug}` : ''}`;
}
/** Nama file unduhan: basename URL Storage bila berekstensi, else visual-<id>.png. */
function filenameFor(img: DraftImageRow, url: string): string {
  try {
    const base = new URL(url).pathname.split('/').pop();
    if (base && /\.[a-z0-9]{2,5}$/i.test(base)) return base;
  } catch {
    // URL tidak valid — pakai fallback di bawah.
  }
  return `visual-${img.id.slice(0, 8)}.png`;
}

/**
 * Carousel riwayat hasil generate visual (cover & per-reply): slide terbaru di
 * depan, geser (swipe embla), tombol chevron, dots, dan keyboard arrow.
 * Tanpa auto-advance — alat review admin. Slide non-aktif diberi inert agar
 * fokus/aksinya tidak bocor ke layar pembaca.
 */
export function ImageHistoryCarousel({ rows, selectedId, variant = 'cover', isPending = false, onSelect, onRetry, onUseAsReference, modelOptions }: Props) {
  const [emblaRef, emblaApi] = useEmblaCarousel({ align: 'start', slidesToScroll: 1 });
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [broken, setBroken] = useState<ReadonlySet<string>>(() => new Set());
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const latestIdRef = useRef<string | null>(rows[0]?.id ?? null);
  const focusIdRef = useRef<string | null>(rows[0]?.id ?? null);

  const count = rows.length;
  const isCover = variant === 'cover';

  // Sinkron index + id slide aktif saat user geser/klik dots.
  useEffect(() => {
    if (!emblaApi) return;
    const onSlideSelect = () => {
      const idx = emblaApi.selectedScrollSnap();
      setSelectedIndex(idx);
      focusIdRef.current = rows[idx]?.id ?? null;
    };
    emblaApi.on('select', onSlideSelect);
    emblaApi.on('reInit', onSlideSelect);
    return () => {
      emblaApi.off('select', onSlideSelect);
      emblaApi.off('reInit', onSlideSelect);
    };
  }, [emblaApi, rows]);

  // Rows berubah (refresh/generate): ada baris baru di depan → tampilkan
  // terbaru; kalau terbaru sama, pertahankan slide yang sedang dilihat (by id).
  useEffect(() => {
    if (!emblaApi) return;
    emblaApi.reInit();
    const newLatest = rows[0]?.id ?? null;
    if (newLatest !== latestIdRef.current) {
      latestIdRef.current = newLatest;
      focusIdRef.current = newLatest;
      emblaApi.scrollTo(0, true);
      setSelectedIndex(0);
      return;
    }
    const focusId = focusIdRef.current;
    if (!focusId) return;
    const idx = rows.findIndex((r) => r.id === focusId);
    if (idx >= 0 && idx !== emblaApi.selectedScrollSnap()) {
      emblaApi.scrollTo(idx, true);
      setSelectedIndex(idx);
    }
  }, [emblaApi, rows]);

  function scrollPrev() {
    emblaApi?.scrollPrev();
  }

  function scrollNext() {
    emblaApi?.scrollNext();
  }

  function goTo(idx: number) {
    emblaApi?.scrollTo(idx);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      scrollPrev();
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      scrollNext();
    }
  }

  async function download(img: DraftImageRow) {
    const url = img.public_url;
    if (!url || downloadingId) return;
    setDownloadingId(img.id);
    try {
      // URL Storage lintas origin: atribut download <a> diabaikan browser,
      // jadi unduh via fetch → blob → object URL.
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = filenameFor(img, url);
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(objectUrl);
    } catch {
      // CORS/network gagal — fallback: buka di tab baru agar tetap bisa disimpan manual.
      window.open(url, '_blank', 'noreferrer');
    } finally {
      setDownloadingId(null);
    }
  }

  if (count === 0) return null;

  return (
    <div role="region" aria-label="Riwayat visualisasi" onKeyDown={handleKeyDown}>
      <div
        ref={emblaRef}
        className="overflow-hidden rounded-lg"
        style={{ touchAction: 'pan-y pinch-zoom' }}
      >
        <div className="flex">
          {rows.map((img, idx) => {
            const imageBroken = broken.has(img.id);
            const ph = placeholderFor(img, imageBroken);
            const hasImage = Boolean(img.public_url) && !imageBroken;
            return (
              <div
                key={img.id}
                data-testid="image-slide"
                className="min-w-0 flex-[0_0_100%]"
                inert={idx === selectedIndex ? undefined : true}
              >
                {hasImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={img.public_url as string}
                    alt={`Hasil generate ${idx + 1} dari ${count}`}
                    className={`w-full ${isCover ? 'max-h-80' : 'max-h-48'} rounded-lg object-cover`}
                    loading="lazy"
                    onError={() => setBroken((prev) => new Set(prev).add(img.id))}
                  />
                ) : (
                  <div className={`flex ${isCover ? 'h-40' : 'h-32'} items-center justify-center rounded-lg border p-3 text-center ${ph.cls}`}>
                    <span className={isCover ? 'text-xs' : 'text-[11px]'}>{ph.text}</span>
                  </div>
                )}

                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <span className={`inline-block rounded px-1.5 py-0.5 font-medium ${STATUS_BADGE[img.status] ?? 'bg-surface text-ink-muted'}`}>
                    {img.status}
                  </span>
                  {img.id === selectedId ? (
                    <span className="rounded bg-emerald-600 px-1.5 py-0.5 font-medium text-white">Terpilih</span>
                  ) : null}
                  {img.reference_public_url ? (
                    <span className="rounded bg-violet-100 px-1.5 py-0.5 font-medium text-violet-800" title="Dibuat dari image reference (img2img)">
                      ref
                    </span>
                  ) : null}
                  <span className={isCover ? 'text-xs text-ink-muted' : 'text-[11px] text-ink-muted'}>
                    {providerModelLabel(img, modelOptions)}
                  </span>
                </div>

                <p className={`mt-1 whitespace-pre-wrap break-words text-ink ${isCover ? 'text-xs' : 'text-[11px] line-clamp-3'}`}>
                  {img.image_prompt || 'Menunggu worker...'}
                </p>
                {img.negative_prompt ? (
                  <p className={`mt-1 text-ink-muted ${isCover ? 'text-xs' : 'text-[11px]'}`}>Negative: {img.negative_prompt}</p>
                ) : null}
                {img.reasoning?.visual_strategy ? (
                  <p className={`mt-1 text-ink-muted ${isCover ? 'text-xs' : 'text-[11px]'}`}>
                    Strategi: {img.reasoning.visual_strategy}
                    {img.reasoning.hook_keywords?.length ? ` · hook: ${img.reasoning.hook_keywords.join(', ')}` : ''}
                    {img.reasoning.justification ? ` — ${img.reasoning.justification}` : ''}
                  </p>
                ) : null}

                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {hasImage ? (
                    <>
                      <a
                        href={img.public_url as string}
                        target="_blank"
                        rel="noreferrer"
                        className={`text-primary hover:underline ${isCover ? 'text-xs' : 'text-[11px]'}`}
                      >
                        Lihat
                      </a>
                      <button
                        type="button"
                        onClick={() => download(img)}
                        disabled={isPending || downloadingId !== null}
                        aria-busy={downloadingId === img.id}
                        className={`text-primary hover:underline disabled:opacity-50 ${isCover ? 'text-xs' : 'text-[11px]'}`}
                      >
                        {downloadingId === img.id ? 'Mengunduh...' : 'Unduh'}
                      </button>
                    </>
                  ) : null}
                  {onSelect && (img.status === 'ready' || img.status === 'selected') && img.id !== selectedId ? (
                    <button
                      type="button"
                      onClick={() => onSelect(img.id)}
                      disabled={isPending}
                      className={`text-primary hover:underline disabled:opacity-50 ${isCover ? 'text-xs' : 'text-[11px]'}`}
                    >
                      Pilih
                    </button>
                  ) : null}
                  {onRetry && img.status === 'failed' ? (
                    <button
                      type="button"
                      onClick={() => onRetry(img.id)}
                      disabled={isPending}
                      aria-busy={isPending}
                      title="Kembalikan ke antrean worker (attempts direset)"
                      className={`text-primary hover:underline disabled:opacity-50 ${isCover ? 'text-xs' : 'text-[11px]'}`}
                    >
                      Ulangi
                    </button>
                  ) : null}
                  {onUseAsReference && hasImage && (img.status === 'ready' || img.status === 'selected') ? (
                    <button
                      type="button"
                      onClick={() => onUseAsReference(img.public_url as string)}
                      disabled={isPending}
                      title="Pakai gambar ini sebagai referensi img2img"
                      className={`text-primary hover:underline disabled:opacity-50 ${isCover ? 'text-xs' : 'text-[11px]'}`}
                    >
                      Jadikan referensi
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {count > 1 ? (
        <>
          <div className="mt-2 flex items-center justify-center gap-2">
            <button
              type="button"
              onClick={scrollPrev}
              disabled={selectedIndex === 0}
              aria-label="Slide sebelumnya"
              className="flex size-8 items-center justify-center rounded-lg border border-line bg-surface text-ink transition-colors hover:border-primary hover:text-primary disabled:opacity-40"
            >
              <ChevronLeft className="size-4" aria-hidden />
            </button>
            <span data-testid="slide-counter" aria-live="polite" className="text-xs tabular-nums text-ink-muted">
              {selectedIndex + 1}/{count}
            </span>
            <button
              type="button"
              onClick={scrollNext}
              disabled={selectedIndex === count - 1}
              aria-label="Slide berikutnya"
              className="flex size-8 items-center justify-center rounded-lg border border-line bg-surface text-ink transition-colors hover:border-primary hover:text-primary disabled:opacity-40"
            >
              <ChevronRight className="size-4" aria-hidden />
            </button>
          </div>
          <ul className="mt-1.5 flex flex-wrap justify-center gap-1.5">
            {rows.map((r, dotIndex) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => goTo(dotIndex)}
                  aria-label={`Slide ${dotIndex + 1} dari ${count}`}
                  aria-current={dotIndex === selectedIndex}
                  className="flex min-h-touch items-center"
                >
                  <span
                    className={
                      dotIndex === selectedIndex
                        ? 'h-1.5 w-5 rounded-full bg-primary transition-colors'
                        : 'h-1.5 w-1.5 rounded-full bg-line transition-colors hover:bg-ink-muted'
                    }
                    aria-hidden
                  />
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}
