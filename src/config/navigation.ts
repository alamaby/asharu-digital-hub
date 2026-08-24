/**
 * Primary navigation model. `pathname` values must match keys of the
 * `pathnames` map in `src/i18n/routing.ts` so localized URLs stay consistent.
 */
export interface NavItem {
  key: 'home' | 'stores' | 'products' | 'properties' | 'about';
  pathname: '/' | '/products' | '/properties' | '/about';
  /** In-page anchor (homepage sections). */
  hash?: string;
  /** Anchor-only entries never get `aria-current="page"`. */
  isAnchor?: boolean;
}

export const mainNavItems: readonly NavItem[] = [
  { key: 'home', pathname: '/' },
  { key: 'stores', pathname: '/', hash: 'online-stores', isAnchor: true },
  { key: 'products', pathname: '/products' },
  { key: 'properties', pathname: '/properties' },
  { key: 'about', pathname: '/about' }
];
