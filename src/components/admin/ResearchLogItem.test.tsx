import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ResearchLogItem } from './ResearchLogItem';

describe('ResearchLogItem', () => {
  it('renders short messages without a toggle', () => {
    render(
      <ResearchLogItem stage="discovering" level="info" time="t" message="ok" expandLabel="More" collapseLabel="Less" />
    );
    expect(screen.getByText('ok')).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('clamps long messages and toggles on click', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <ResearchLogItem stage="scoring" level="error" time="t" message={'x'.repeat(400)} expandLabel="More" collapseLabel="Less" />
    );
    const btn = screen.getByRole('button', { name: 'More' });
    expect(btn).toHaveAttribute('aria-expanded', 'false');
    expect(container.querySelector('p:nth-of-type(2)')).toHaveClass('line-clamp-3');
    await user.click(btn);
    expect(screen.getByRole('button', { name: 'Less' })).toHaveAttribute('aria-expanded', 'true');
    expect(container.querySelector('p:nth-of-type(2)')).not.toHaveClass('line-clamp-3');
  });
});
