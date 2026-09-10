import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ActionNoticeView, BoardSkeleton, PendingButton } from './ActionFeedback';

describe('ActionNoticeView', () => {
  it('renders null notice as nothing', () => {
    const { container } = render(<ActionNoticeView notice={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders working/success as status with live text', () => {
    const { rerender } = render(<ActionNoticeView notice={{ type: 'working', message: 'Menyimpan…' }} />);
    expect(screen.getByRole('status')).toHaveTextContent('Menyimpan…');
    rerender(<ActionNoticeView notice={{ type: 'success', message: 'Tersimpan.' }} />);
    expect(screen.getByRole('status')).toHaveTextContent('Tersimpan.');
  });

  it('renders error as alert with collapsible technical detail', async () => {
    const user = userEvent.setup();
    render(<ActionNoticeView notice={{ type: 'error', message: 'Gagal menyimpan.', detail: 'boom-123' }} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Gagal menyimpan.');
    // Detail teknis collapsed di dalam <details> tertutup.
    const details = screen.getByText('boom-123').closest('details');
    expect(details).not.toBeNull();
    expect(details).not.toHaveAttribute('open');
    await user.click(screen.getByText('Detail teknis'));
    expect(screen.getByText('Detail teknis').closest('details')).toHaveAttribute('open');
  });
});

describe('BoardSkeleton', () => {
  it('is announced as busy with configurable rows', () => {
    const { container } = render(<BoardSkeleton lines={3} label="Memuat model…" />);
    const region = screen.getByLabelText('Memuat model…');
    expect(region).toHaveAttribute('aria-busy', 'true');
    expect(container.querySelectorAll('.animate-pulse')).toHaveLength(3);
  });
});

describe('PendingButton', () => {
  it('renders submit label by default (no form context)', () => {
    // useFormStatus outside a form reports pending=false.
    render(<PendingButton label="Simpan" />);
    const btn = screen.getByRole('button', { name: 'Simpan' });
    expect(btn).toHaveAttribute('type', 'submit');
    expect(btn).not.toBeDisabled();
  });
});
