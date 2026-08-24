import Image from 'next/image';

interface ResponsiveImageProps {
  src: string;
  alt: string;
  width?: number;
  height?: number;
  className?: string;
  sizes?: string;
  priority?: boolean;
}

/**
 * next/image wrapper. Local placeholder SVGs are served unoptimized (the
 * optimizer would rasterize them); real WebP/JPEG assets get full
 * optimization automatically once they replace the placeholders.
 */
export function ResponsiveImage({
  src,
  alt,
  width,
  height,
  className,
  sizes,
  priority
}: ResponsiveImageProps) {
  const isSvg = src.toLowerCase().endsWith('.svg');
  return (
    <Image
      src={src}
      alt={alt}
      {...(width && height ? { width, height } : {})}
      className={className}
      {...(sizes ? { sizes } : {})}
      priority={priority}
      unoptimized={isSvg || undefined}
    />
  );
}
