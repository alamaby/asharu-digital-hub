import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { GithubRepoLink } from './GithubRepoLink';
import { siteConfig } from '@/config/site';

describe('GithubRepoLink', () => {
  it('points to the public repo with target=_blank', () => {
    const { getByRole } = render(
      <GithubRepoLink cta="Lihat Kode di GitHub" newTabLabel="(membuka di tab baru)" />
    );
    const anchor = getByRole('link');
    expect(anchor).toHaveAttribute('href', siteConfig.repoUrl);
    expect(anchor).toHaveAttribute('target', '_blank');
    expect(anchor).toHaveTextContent('Lihat Kode di GitHub');
  });

  it('names the repo slug in the accessible label', () => {
    const { getByRole } = render(
      <GithubRepoLink cta="Lihat Kode di GitHub" newTabLabel="(membuka di tab baru)" />
    );
    expect(getByRole('link')).toHaveAttribute(
      'aria-label',
      `Lihat Kode di GitHub — ${siteConfig.repoSlug} (membuka di tab baru)`
    );
  });

  it('inline variant shows the repo slug visibly', () => {
    const { getByRole } = render(
      <GithubRepoLink
        cta="Lihat Kode di GitHub"
        newTabLabel="(membuka di tab baru)"
        variant="inline"
      />
    );
    const anchor = getByRole('link');
    expect(anchor).toHaveTextContent(siteConfig.repoSlug);
    expect(anchor.className).toContain('underline');
  });
});
