import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

// next-intl imports from next/navigation which isn't resolved in vitest.
// Provide a minimal mock so client components that use `Link` from
// `@/i18n/navigation` can be rendered in tests.
vi.mock('next/navigation', () => ({
  usePathname: () => '/id/current-path',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
  redirect: vi.fn()
}));

vi.mock('@/i18n/navigation', () => ({
  Link: ({ children, href, ...rest }: { children: React.ReactNode; href: unknown; [k: string]: unknown }) => {
    const hrefString = typeof href === 'string' ? href : typeof href === 'object' && href !== null && 'pathname' in href
      ? String((href as { pathname: string }).pathname)
      : '#';
    return <a href={hrefString} {...rest}>{children}</a>;
  },
  usePathname: () => '/id/current-path',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() })
}));
