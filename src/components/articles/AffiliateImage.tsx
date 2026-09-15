'use client';

/** Placeholder lokal bila gambar afiliasi kosong/rusak (konsisten dengan picker/card). */
export const AFFILIATE_FALLBACK_IMAGE = '/images/products/product-placeholder-1.svg';

interface AffiliateImageProps {
  src: string;
  alt: string;
  width: number;
  height: number;
  className?: string;
}

/**
 * Island client kecil untuk thumbnail afiliasi: `onError` adalah event
 * handler sehingga tidak boleh tinggal di Server Component
 * (`ArticlePublicView`) — Next.js menolak function prop saat serialisasi
 * RSC (error digest 1391377559). Sekali saja: gambar rusak → placeholder,
 * tanpa loop (guard dataset).
 */
export function AffiliateImage({ src, alt, width, height, className }: AffiliateImageProps) {
  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      src={src}
      alt={alt}
      width={width}
      height={height}
      loading="lazy"
      className={className}
      onError={(event) => {
        const img = event.currentTarget;
        if (img.dataset.fallback === 'true') return;
        img.dataset.fallback = 'true';
        img.src = AFFILIATE_FALLBACK_IMAGE;
      }}
    />
  );
}
