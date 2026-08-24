'use client';

import { useParams } from 'next/navigation';
import { useTransition } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { usePathname, useRouter } from '@/i18n/navigation';
import { routing, type Locale } from '@/i18n/routing';
import { trackEvent } from '@/lib/analytics/events';
import { cn } from '@/lib/utils/cn';

const LOCALE_COOKIE = 'NEXT_LOCALE';

/**
 * ID | EN switcher. Preserves the current page (including dynamic params)
 * and stores the choice in a first-party cookie for future visits.
 */
export function LanguageSwitcher({ className }: { className?: string }) {
  const t = useTranslations('header');
  const locale = useLocale() as Locale;
  const pathname = usePathname();
  const router = useRouter();
  const routeParams = useParams() as { slug?: string };
  const [isPending, startTransition] = useTransition();

  function switchTo(nextLocale: Locale) {
    if (nextLocale === locale) return;
    trackEvent('change_language', { locale: nextLocale });
    document.cookie = `${LOCALE_COOKIE}=${nextLocale}; path=/; max-age=31536000; samesite=lax`;
    startTransition(() => {
      const slug = routeParams.slug;
      if (pathname === '/properties/[slug]' && typeof slug === 'string') {
        router.replace(
          { pathname, params: { slug } },
          { locale: nextLocale }
        );
      } else if (pathname === '/properties/[slug]') {
        router.replace('/properties', { locale: nextLocale });
      } else {
        router.replace(pathname, { locale: nextLocale });
      }
    });
  }

  return (
    <div
      role="group"
      aria-label={t('language')}
      className={cn(
        'inline-flex items-center overflow-hidden rounded-lg border border-line bg-surface text-sm font-semibold',
        isPending && 'opacity-60',
        className
      )}
    >
      {routing.locales.map((loc) => {
        const active = loc === locale;
        return (
          <button
            key={loc}
            type="button"
            disabled={isPending}
            aria-current={active ? 'true' : undefined}
            onClick={() => switchTo(loc)}
            className={cn(
              'min-h-touch px-3 transition-colors',
              active && 'bg-primary text-white',
              !active &&
                !isPending &&
                'text-ink-muted hover:bg-background hover:text-primary'
            )}
          >
            {loc.toUpperCase()}
          </button>
        );
      })}
    </div>
  );
}
