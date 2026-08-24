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
    throw new Error(`Unsafe link target: "${href}"`);
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
