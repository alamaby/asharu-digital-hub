import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FeaturedProductBoard } from './FeaturedProductBoard';
import { renderWithMessages } from '@/test/utils';

vi.mock('@/lib/admin/affiliate-actions', () => ({
  setProductFeatured: vi.fn()
}));

const { setProductFeatured } = await import('@/lib/admin/affiliate-actions');

beforeEach(() => {
  vi.mocked(setProductFeatured).mockReset();
});

const makeRow = (overrides: Partial<{ id: string; featured_override: boolean | null; is_featured: boolean }> = {}) => ({
  id: 'p1',
  friendly_code: 'ASH-001',
  name_id: 'Kopi Susu',
  merchant: 'Toko A',
  category: 'food',
  image: null,
  url: null,
  is_featured: true,
  featured_override: null,
  featured_override_at: null,
  created_at: '2026-09-01T00:00:00Z',
  ...overrides
});

describe('FeaturedProductBoard — pagination', () => {
  it('menampilkan counter rangeInfo halaman 1 dengan 20 item', () => {
    const items = Array.from({ length: 20 }, (_, i) => makeRow({ id: `p${i}` }));
    renderWithMessages(<FeaturedProductBoard items={items} curatedCount={2} page={1} totalPages={2} totalCount={20} q="" filter="all" />);
    // pageRange(1) = {from:0,to:19}; display = 1–20.
    expect(screen.getByRole('status')).toHaveTextContent('1–20 dari 20');
  });

  it('menampilkan counter rangeInfo halaman 2 dengan sisa 5 item', () => {
    const items = Array.from({ length: 5 }, (_, i) => makeRow({ id: `p${i}` }));
    renderWithMessages(<FeaturedProductBoard items={items} curatedCount={0} page={2} totalPages={2} totalCount={25} q="" filter="all" />);
    // pageRange(2) = {from:20,to:39}; display = 21–25 (cap di totalCount).
    expect(screen.getByRole('status')).toHaveTextContent('21–25 dari 25');
  });

  it('Prev tersembunyi di halaman 1, Next muncul saat belum terakhir', () => {
    const items = [makeRow()];
    const { container } = renderWithMessages(<FeaturedProductBoard items={items} curatedCount={0} page={1} totalPages={3} totalCount={20} q="" filter="all" />);
    // Prev tidak ada (hanya Next).
    expect(container.querySelector('a[href*="page=1"]')).toBeNull();
    const nextLink = container.querySelector('a[href*="page=2"]');
    expect(nextLink).not.toBeNull();
  });

  it('Next tersembunyi di halaman terakhir', () => {
    const items = [makeRow()];
    const { container } = renderWithMessages(<FeaturedProductBoard items={items} curatedCount={0} page={3} totalPages={3} totalCount={20} q="" filter="all" />);
    expect(container.querySelector('a[href*="page=4"]')).toBeNull();
  });

  it('mempertahankan q dan filter di link navigasi', () => {
    const items = [makeRow()];
    const { container } = renderWithMessages(
      <FeaturedProductBoard items={items} curatedCount={0} page={1} totalPages={2} totalCount={20} q="shopee" filter="pinned" />
    );
    const nextLink = container.querySelector('a[href*="page=2"]');
    expect(nextLink).not.toBeNull();
    // href harus mengandung q dan filter.
    const href = (nextLink as HTMLElement).getAttribute('href');
    expect(href).toContain('q=shopee');
    expect(href).toContain('filter=pinned');
  });
});

describe('FeaturedProductBoard — empty', () => {
  it('menampilkan pesan empty ketika items kosong', () => {
    renderWithMessages(<FeaturedProductBoard items={[]} curatedCount={0} page={1} totalPages={1} totalCount={0} q="" filter="all" />);
    expect(screen.getByText(/tidak ada produk/i)).toBeInTheDocument();
  });
});

describe('FeaturedProductBoard — tombol busy', () => {
  it('tombol berubah jadi spinner + saving saat aksi berjalan', async () => {
    const user = userEvent.setup();
    const mock = vi.mocked(setProductFeatured);
    // Delay sebentar supaya bisa assert state busy.
    mock.mockImplementationOnce(() => new Promise((resolve) => setTimeout(() => resolve({ ok: true }), 50)));
    const items = [makeRow()];
    renderWithMessages(<FeaturedProductBoard items={items} curatedCount={0} page={1} totalPages={1} totalCount={1} q="" filter="all" />);
    const btn = screen.getByRole('button', { name: /featured/i });
    await user.click(btn);
    await waitFor(() => {
      expect(btn).toHaveAttribute('aria-busy', 'true');
      expect(btn).toHaveTextContent(/menyimpan/i);
    });
  });

  it('notice sukses muncul setelah aksi selesai', async () => {
    const user = userEvent.setup();
    const mock = vi.mocked(setProductFeatured);
    mock.mockResolvedValue({ ok: true });
    const items = [makeRow()];
    renderWithMessages(<FeaturedProductBoard items={items} curatedCount={0} page={1} totalPages={1} totalCount={1} q="" filter="all" />);
    const btn = screen.getByRole('button', { name: /featured/i });
    await user.click(btn);
    await waitFor(() => {
      // Ambil element status notice (bukan yang rangeInfo).
      const notices = screen.getAllByRole('status');
      const noticeEl = notices.find((el) => el.tagName === 'P' && el.className.includes('rounded-lg'));
      expect(noticeEl).toBeInTheDocument();
      expect(noticeEl).toHaveTextContent(/produk ditandai featured/i);
    });
  });
});

describe('FeaturedProductBoard — form filter', () => {
  it('form memiliki input q dan select filter dengan nilai default', () => {
    const items = [makeRow()];
    renderWithMessages(<FeaturedProductBoard items={items} curatedCount={0} page={1} totalPages={1} totalCount={1} q="shopee" filter="pinned" />);
    const qInput = document.querySelector<HTMLInputElement>('input[name="q"]');
    expect(qInput?.value).toBe('shopee');
    const filterSelect = document.querySelector<HTMLSelectElement>('select[name="filter"]');
    expect(filterSelect?.value).toBe('pinned');
  });

  it('tombol reset muncul ketika ada filter aktif', () => {
    const items = [makeRow()];
    renderWithMessages(<FeaturedProductBoard items={items} curatedCount={0} page={1} totalPages={1} totalCount={1} q="shopee" filter="all" />);
    expect(screen.getByText(/reset/i)).toBeInTheDocument();
  });

  it('tombol reset tidak muncul ketika filter default (kosong)', () => {
    const items = [makeRow()];
    renderWithMessages(<FeaturedProductBoard items={items} curatedCount={0} page={1} totalPages={1} totalCount={1} q="" filter="all" />);
    expect(screen.queryByText(/reset/i)).toBeNull();
  });
});
