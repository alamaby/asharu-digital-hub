import { useLocale } from 'next-intl';
import type { Locale } from '@/i18n/routing';
import type { SocialLink } from '@/data/schemas';
import { TrackedExternalLink } from '@/components/ui/TrackedExternalLink';
import { PlatformIcon } from '@/components/ui/PlatformIcon';

interface SocialLinksGridProps {
  links: SocialLink[];
  linkPosition: string;
}

/** Icon + text social entries; never icon-only (WCAG). */
export function SocialLinksGrid({ links, linkPosition }: SocialLinksGridProps) {
  const locale = useLocale() as Locale;

  return (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {links.map((link) => (
        <li key={link.id}>
          <TrackedExternalLink
            href={link.url}
            event="click_social_media"
            params={{ platform: link.platform, link_position: linkPosition }}
            className="flex min-h-touch items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3 shadow-card transition-colors hover:border-primary"
          >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <PlatformIcon platform={link.platform} className="size-4" />
            </span>
            <span>
              <span className="block text-sm font-semibold text-ink">
                {link.name[locale]}
              </span>
              <span className="block text-xs text-ink-muted">{link.handle}</span>
            </span>
          </TrackedExternalLink>
        </li>
      ))}
    </ul>
  );
}
