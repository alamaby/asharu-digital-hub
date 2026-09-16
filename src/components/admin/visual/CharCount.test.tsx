import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CharCount } from './CharCount';

describe('CharCount', () => {
  it('shows current/max with neutral styling when within range', () => {
    render(<CharCount current={42} max={500} />);
    const el = screen.getByText('42/500');
    expect(el).toHaveClass('text-ink-muted');
    expect(el).toHaveAttribute('title', '42 dari maks 500 karakter');
  });

  it('flags over-limit with red text and hint title', () => {
    render(<CharCount current={80} max={60} />);
    const el = screen.getByText('80/60');
    expect(el).toHaveClass('font-semibold', 'text-red-700');
    expect(el).toHaveAttribute('title', '80 karakter, melebihi batas 60');
  });

  it('flags below-minimum with amber text', () => {
    render(<CharCount current={5} max={500} min={10} />);
    const el = screen.getByText('5/500');
    expect(el).toHaveClass('text-amber-700');
  });

  it('does not flag below-minimum when empty', () => {
    render(<CharCount current={0} max={500} min={10} />);
    expect(screen.getByText('0/500')).toHaveClass('text-ink-muted');
  });
});
