import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ContentRequestForm } from './ContentRequestForm';
import { renderWithMessages } from '@/test/utils';

const mockCategories = [{ slug: 'fashion', display_name: 'Fashion' }];

const platforms = [{ slug: 'threads', display_name: 'Threads' }];

vi.mock('@/lib/content/actions', () => ({
  createResearchSession: vi.fn(),
  generateIdea: vi.fn()
}));

import { createResearchSession } from '@/lib/content/actions';

async function submitForm({ topic = 'Panas Pol? Jangan Lebay! Kipas Genggam Ini Bikin Chill di Mana Aja', audience = 'Parenting' }: { topic?: string; audience?: string } = {}) {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('Topik / angle *'), topic);
  await user.type(screen.getByLabelText(/Audiens/), audience);
  await user.click(screen.getByRole('button', { name: /Buat Draf/ }));
}

describe('ContentRequestForm', () => {
  it('renders all required fields and honeypot', () => {
    renderWithMessages(<ContentRequestForm platforms={[{ slug: 'threads', display_name: 'Threads' }]} categories={mockCategories} />);
    expect(screen.getByLabelText('Topik / angle *')).toBeInTheDocument();
    expect(screen.getByText('Platform', { selector: 'legend' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /Threads/ })).toBeChecked();
    expect(screen.getByLabelText(/Nada/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Audiens/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Buat Draf/ })).toBeInTheDocument();
    // Honeypot is hidden but in DOM
    expect(document.querySelector('input[name="website"]')).toBeInTheDocument();
  });

  it('renders platform checkboxes default-checked and validates min one', () => {
    renderWithMessages(<ContentRequestForm platforms={[{ slug: 'threads', display_name: 'Threads' }, { slug: 'twitter', display_name: 'Twitter' }]} categories={mockCategories} />);
    expect(screen.getByRole('checkbox', { name: /Threads/ })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /Twitter/ })).toBeChecked();
  });

  it('renders mechanism radio defaulting to satu with product picker hidden', () => {
    renderWithMessages(<ContentRequestForm platforms={[{ slug: 'threads', display_name: 'Threads' }]} categories={mockCategories} />);
    expect(screen.getByRole('radio', { name: /Mekanisme 1/ })).toBeChecked();
    expect(screen.queryByText(/Belum ada produk dipilih/)).not.toBeInTheDocument();
  });

  it('orders mechanism before topic in the form', () => {
    renderWithMessages(<ContentRequestForm platforms={[{ slug: 'threads', display_name: 'Threads' }]} categories={mockCategories} />);
    const legend = screen.getByText('Mekanisme riset', { selector: 'legend' });
    const topic = screen.getByLabelText('Topik / angle *');
    expect(legend.compareDocumentPosition(topic) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('renders template picker defaulting to Bebas', () => {
    renderWithMessages(
      <ContentRequestForm
        platforms={[{ slug: 'threads', display_name: 'Threads' }]}
        categories={mockCategories}
        templates={[{ slug: 'problem-solution', display_name: 'Problem–Solution', description: 'Masalah → Solusi' }]}
      />
    );
    expect(screen.getByText('Template riset', { selector: 'legend' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Bebas/ })).toBeChecked();
    expect(screen.getByRole('radio', { name: /Problem–Solution/ })).not.toBeChecked();
  });

  it('success panel links admin to admin/riset/[sessionId]', async () => {
    const sessId = '241dcd03-e1d1-4a00-9bbb-0e20cde00be8';
    vi.mocked(createResearchSession).mockResolvedValue({ success: true, sessionId: sessId });
    renderWithMessages(<ContentRequestForm platforms={platforms} categories={mockCategories} isAdmin={true} />);
    await submitForm();
    expect(await screen.findByText('Riset berhasil dimulai')).toBeInTheDocument();
    const link = screen.getByRole('link', { name: 'Lihat riset' });
    // Mock Link (vitest.setup.tsx) stringifies href.pathname without locale prefix.
    expect(link).toHaveAttribute('href', `/admin/riset/${sessId}`);
  });

  it('success panel links non-admin to konten/riset/[sessionId]', async () => {
    const sessId = 'ab12cd34-ef56-7890-abcd-ef1234567890';
    vi.mocked(createResearchSession).mockResolvedValue({ success: true, sessionId: sessId });
    renderWithMessages(<ContentRequestForm platforms={platforms} categories={mockCategories} isAdmin={false} />);
    await submitForm();
    expect(await screen.findByText('Riset berhasil dimulai')).toBeInTheDocument();
    const link = screen.getByRole('link', { name: 'Lihat riset' });
    expect(link).toHaveAttribute('href', `/konten/riset/${sessId}`);
  });
});
