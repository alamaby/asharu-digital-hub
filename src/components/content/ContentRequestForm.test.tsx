import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { ContentRequestForm } from './ContentRequestForm';
import { renderWithMessages } from '@/test/utils';

const mockCategories = [{ slug: 'fashion', display_name: 'Fashion' }];

describe('ContentRequestForm', () => {
  it('renders all required fields and honeypot', () => {
    renderWithMessages(<ContentRequestForm platforms={[{ slug: 'threads', display_name: 'Threads' }]} categories={mockCategories} />);
    expect(screen.getByLabelText(/Topik/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Platform/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Nada/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Audiens/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Buat Draf/ })).toBeInTheDocument();
    // Honeypot is hidden but in DOM
    expect(document.querySelector('input[name="website"]')).toBeInTheDocument();
  });

  it('has accessible required markers', () => {
    renderWithMessages(<ContentRequestForm platforms={[{ slug: 'twitter', display_name: 'Twitter' }]} categories={mockCategories} />);
    expect(screen.getAllByText('*').length).toBeGreaterThanOrEqual(5);
  });
});
