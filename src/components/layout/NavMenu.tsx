'use client';

import { useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/navigation';
import { mainNavItems } from '@/config/navigation';
import { cn } from '@/lib/utils/cn';

interface NavMenuProps {
  variant: 'desktop' | 'mobile';
  onNavigate?: () => void;
}

/** Primary nav links with `aria-current="page"` on the active route. */
export function NavMenu({ variant, onNavigate }: NavMenuProps) {
  const t = useTranslations('nav');
  const tHeader = useTranslations('header');
  const pathname = usePathname();

  const linkClass =
    variant === 'desktop'
      ? 'rounded-md px-2 py-1 text-sm font-medium text-ink-muted transition-colors hover:text-primary'
      : cn(
          'flex min-h-touch items-center rounded-lg px-3 text-base font-medium text-ink',
          'hover:bg-background hover:text-primary'
        );

  return (
    <nav aria-label={tHeader('nav')} className={variant === 'desktop' ? undefined : 'pb-2'}>
      <ul className={cn(variant === 'desktop' && 'flex items-center gap-1')}>
        {mainNavItems.map((item) => {
          const active =
            !item.isAnchor &&
            pathname === item.pathname &&
            !(item.key === 'home' && item.hash);
          return (
            <li key={item.key}>
              <Link
                href={{ pathname: item.pathname, ...(item.hash ? { hash: item.hash } : {}) }}
                aria-current={active ? 'page' : undefined}
                onClick={onNavigate}
                className={cn(
                  linkClass,
                  active && (variant === 'desktop'
                    ? 'font-semibold text-primary'
                    : 'bg-background font-semibold text-primary')
                )}
              >
                {t(item.key)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
