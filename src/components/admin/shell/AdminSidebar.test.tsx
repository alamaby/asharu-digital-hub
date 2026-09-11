import type { ComponentProps } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';

const pathnameMock = vi.fn(() => '/admin');

vi.mock('@/i18n/navigation', () => ({
  Link: ({ children, onClick, ...rest }: ComponentProps<'a'>) => (
    <a onClick={onClick} {...rest}>
      {children}
    </a>
  ),
  usePathname: () => pathnameMock(),
  useRouter: () => ({ replace: vi.fn() }),
  redirect: vi.fn(),
  getPathname: vi.fn()
}));

import { AdminSidebar } from '@/components/admin/shell/AdminSidebar';
import { AdminSidebarProvider } from '@/components/admin/shell/AdminSidebarContext';
import { renderWithMessages } from '@/test/utils';

function renderSidebar(isAdmin: boolean) {
  return renderWithMessages(
    <AdminSidebarProvider>
      <AdminSidebar isAdmin={isAdmin} />
    </AdminSidebarProvider>
  );
}

describe('AdminSidebar', () => {
  beforeEach(() => {
    pathnameMock.mockReturnValue('/admin');
  });

  it('admin sees all manage entries with current page marked', () => {
    renderSidebar(true);
    expect(screen.getByRole('link', { name: 'Dasbor' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Konten' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Riset' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'LLM' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Visual' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sosial' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Masuk' })).not.toBeInTheDocument();
  });

  it('non-admin sees only public entries plus sign-in', () => {
    renderSidebar(false);
    expect(screen.getByRole('link', { name: 'Buat' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Kembali ke situs' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Masuk' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Dasbor' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Riset' })).not.toBeInTheDocument();
  });

  it('marks parent entry current on detail pages', () => {
    pathnameMock.mockReturnValue('/admin/riset/abc/topics/def');
    renderSidebar(true);
    expect(screen.getByRole('link', { name: 'Riset' })).toHaveAttribute('aria-current', 'page');
  });

  it('renders section headings for manage, create and other groups', () => {
    renderSidebar(true);
    expect(screen.getByRole('heading', { name: 'Kelola' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Buat' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Lainnya' })).toBeInTheDocument();
  });
});
