/**
 * Primary navigation model. `pathname` values must match keys of the
 * `pathnames` map in `src/i18n/routing.ts` so localized URLs stay consistent.
 */
export interface NavItem {
  key:
    | 'home'
    | 'stores'
    | 'products'
    | 'properties'
    | 'about'
    | 'adminDashboard'
    | 'adminKonten'
    | 'adminBaru'
    | 'adminReview'
    | 'adminRiset'
    | 'adminLlm';
  pathname:
    | '/'
    | '/products'
    | '/properties'
    | '/about'
    | '/admin'
    | '/admin/konten'
    | '/admin/riset'
    | '/admin/llm'
    | '/admin/llm/logs'
    | '/konten/baru'
    | '/konten/review';
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

/**
 * Admin-only nav items, rendered after the public items in Header/MobileNav
 * when the current user is an admin (server-rendered check; no flicker).
 */
export const adminNavItems: readonly NavItem[] = [
  { key: 'adminDashboard', pathname: '/admin' },
  { key: 'adminKonten', pathname: '/admin/konten' },
  { key: 'adminRiset', pathname: '/admin/riset' },
  { key: 'adminLlm', pathname: '/admin/llm' },
  { key: 'adminBaru', pathname: '/konten/baru' },
  { key: 'adminReview', pathname: '/konten/review' }
];
