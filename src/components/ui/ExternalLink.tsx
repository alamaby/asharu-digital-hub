import type { AnchorHTMLAttributes, ReactNode } from 'react';
import { isSafeExternalUrl } from '@/lib/utils/safe-url';

interface ExternalLinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  href: string;
  children: ReactNode;
}

/**
 * Safe-by-default anchor for off-site targets. https URLs open in a new tab
 * with `noopener noreferrer`; mailto/tel render as plain links.
 */
export function ExternalLink({
  href,
  rel,
  children,
  ...rest
}: ExternalLinkProps) {
  if (!isSafeExternalUrl(href)) {
    // JANGAN melempar saat render: satu nilai URL buruk dari DB (mis. `http://`
    // hasil scraping, atau string kosong) akan menjatuhkan seluruh halaman
    // publik menjadi 500. Turunkan ke teks biasa dan catat supaya tetap
    // terlihat di log — keamanan tetap terjaga (tidak ada anchor dibuat).
    console.error(`ExternalLink: href tidak aman, dirender sebagai teks: "${href}"`);
    return <span className={rest.className}>{children}</span>;
  }

  const isNewTab = href.startsWith('https://');
  const mergedRel = [isNewTab ? 'noopener noreferrer' : undefined, rel]
    .filter(Boolean)
    .join(' ');

  return (
    <a
      href={href}
      {...(isNewTab ? { target: '_blank' } : {})}
      {...(mergedRel ? { rel: mergedRel } : {})}
      {...rest}
    >
      {children}
    </a>
  );
}
