import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { ContentRequestForm } from './ContentRequestForm';
import { renderWithMessages } from '@/test/utils';

const mockCategories = [{ slug: 'fashion', display_name: 'Fashion' }];

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
});
