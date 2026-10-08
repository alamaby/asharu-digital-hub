import { ArrowUpRight, Github } from 'lucide-react';
import { siteConfig } from '@/config/site';
import { cn } from '@/lib/utils/cn';
import { ExternalLink } from './ExternalLink';

interface GithubRepoLinkProps {
  /** Translated CTA label (e.g. home.digitalHub.repoCta). */
  cta: string;
  /** Translated a11y.newTab label passed from the server page. */
  newTabLabel: string;
  /** `button` for hero/promo CTA rows, `inline` for in-card links. */
  variant?: 'button' | 'inline';
  className?: string;
}

/**
 * Link to the public open-source repository. The repo slug is part of the
 * accessible name so screen-reader users hear the destination identity.
 */
export function GithubRepoLink({ cta, newTabLabel, variant = 'button', className }: GithubRepoLinkProps) {
  const isButton = variant === 'button';
  return (
    <ExternalLink
      href={siteConfig.repoUrl}
      className={cn(
        isButton
          ? 'btn-secondary'
          : 'inline-flex min-h-touch items-center gap-1.5 text-sm font-semibold text-primary underline underline-offset-4 hover:text-primary-dark',
        className
      )}
      aria-label={`${cta} — ${siteConfig.repoSlug} ${newTabLabel}`}
    >
      <Github className={isButton ? 'size-4' : 'size-3.5'} aria-hidden />
      {isButton ? cta : siteConfig.repoSlug}
      {isButton ? <ArrowUpRight className="size-4" aria-hidden /> : null}
    </ExternalLink>
  );
}
