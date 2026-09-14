import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

// next-intl imports from next/navigation which isn't resolved in vitest.
// Provide a minimal mock so client components that use `Link` from
// `@/i18n/navigation` can be rendered in tests.
vi.mock('next/navigation', () => ({
  usePathname: () => '/id/current-path',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
  redirect: vi.fn()
}));

vi.mock('@/i18n/navigation', () => ({
  Link: ({ children, href, ...rest }: { children: React.ReactNode; href: unknown; [k: string]: unknown }) => {
    let hrefString: string;
    if (typeof href === 'string') {
      hrefString = href;
    } else if (href !== null && typeof href === 'object' && 'pathname' in href) {
      const { pathname, params, query, hash } = href as {
        pathname: string;
        params?: Record<string, string>;
        query?: Record<string, string>;
        hash?: string;
      };
      // Resolve [param] path segments so tests can assert concrete session URLs.
      const resolvedPath = params
        ? pathname.replace(/\[([^\]]+)\]/g, (_m, key: string) =>
            params[key] != null ? String(params[key]) : `[${key}]`
          )
        : pathname;
      hrefString =
        resolvedPath +
        (query ? `?${new URLSearchParams(query).toString()}` : '') +
        (hash ? `#${hash}` : '');
    } else {
      hrefString = '#';
    }
    return <a href={hrefString} {...rest}>{children}</a>;
  },
  usePathname: () => '/id/current-path',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn() })
}));
