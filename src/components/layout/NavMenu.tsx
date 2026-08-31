'use client';

import { useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/navigation';
import type { NavItem } from '@/config/navigation';
import { cn } from '@/lib/utils/cn';

interface NavMenuProps {
  variant: 'desktop' | 'mobile';
  items: readonly NavItem[];
  adminItems?: readonly NavItem[];
  onNavigate?: () => void;
}

/** Primary nav links with `aria-current="page"` on the active route. */
export function NavMenu({ variant, items, adminItems, onNavigate }: NavMenuProps) {
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

  const renderItem = (item: NavItem) => {
    const active = !item.isAnchor && pathname === item.pathname;
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
  };

  return (
    <nav aria-label={tHeader('nav')} className={variant === 'desktop' ? undefined : 'pb-2'}>
      <ul
        className={cn(
          variant === 'desktop' && 'flex items-center gap-1',
          variant === 'mobile' && 'flex flex-col gap-1'
        )}
      >
        {items.map(renderItem)}
      </ul>
      {adminItems && adminItems.length > 0 ? (
        <>
          {variant === 'desktop' ? (
            <span
              aria-hidden
              className="mx-2 inline-block h-5 w-px bg-line align-middle"
            />
          ) : (
            <div className="mt-3 border-t border-line pt-3">
              <p className="px-3 text-xs font-semibold uppercase tracking-wide text-ink-muted">
                {t('adminLabel')}
              </p>
            </div>
          )}
          <ul
            className={cn(
              variant === 'desktop' && 'ml-2 inline-flex items-center gap-1',
              variant === 'mobile' && 'flex flex-col gap-1'
            )}
          >
            {adminItems.map(renderItem)}
          </ul>
        </>
      ) : null}
    </nav>
  );
}
