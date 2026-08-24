import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { ExternalLink } from './ExternalLink';

describe('ExternalLink', () => {
  it('adds target=_blank and noopener/noreferrer to https links', () => {
    const { getByText } = render(
      <ExternalLink href="https://shopee.co.id/asharu">Shopee</ExternalLink>
    );
    const anchor = getByText('Shopee').closest('a');
    expect(anchor).toHaveAttribute('target', '_blank');
    expect(anchor).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('merges extra rel values (sponsored for affiliates)', () => {
    const { getByText } = render(
      <ExternalLink href="https://merchant.example/x" rel="sponsored nofollow">
        Produk
      </ExternalLink>
    );
    const rel = getByText('Produk').closest('a')?.getAttribute('rel');
    expect(rel).toContain('sponsored');
    expect(rel).toContain('nofollow');
    expect(rel).toContain('noopener');
    expect(rel).toContain('noreferrer');
  });

  it('renders mailto without target or rel', () => {
    const { getByText } = render(
      <ExternalLink href="mailto:hello@asharu.id">Email</ExternalLink>
    );
    const anchor = getByText('Email').closest('a');
    expect(anchor).not.toHaveAttribute('target');
    expect(anchor).not.toHaveAttribute('rel');
  });

  it.each(['javascript:alert(1)', 'http://insecure.example', 'data:text/html,x'])(
    'refuses unsafe target %s',
    (href) => {
      expect(() => render(<ExternalLink href={href}>x</ExternalLink>)).toThrow();
    }
  );
});
