'use client';

import { useEffect, useRef, useState } from 'react';
import { Menu, X } from 'lucide-react';
import { usePathname } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';
import { LanguageSwitcher } from './LanguageSwitcher';
import { NavMenu } from './NavMenu';

/** Mobile hamburger menu: Escape closes, route change closes, focus returns to the toggle. */
export function MobileNav() {
  const t = useTranslations('header');
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === 'Escape' && open) {
      setOpen(false);
      toggleRef.current?.focus();
    }
  }

  return (
    <div className="relative md:hidden" onKeyDown={onKeyDown}>
      <button
        ref={toggleRef}
        type="button"
        aria-expanded={open}
        aria-controls="mobile-menu"
        onClick={() => setOpen((value) => !value)}
        className="flex min-h-touch min-w-touch items-center justify-center rounded-lg border border-line bg-surface text-ink transition-colors hover:border-primary hover:text-primary"
      >
        {open ? (
          <X className="size-5" aria-hidden />
        ) : (
          <Menu className="size-5" aria-hidden />
        )}
        <span className="sr-only">{open ? t('closeMenu') : t('openMenu')}</span>
      </button>

      {open ? (
        <div
          id="mobile-menu"
          className="absolute inset-x-0 top-full z-40 mt-2 rounded-xl border border-line bg-surface p-4 shadow-card"
        >
          <NavMenu variant="mobile" onNavigate={() => setOpen(false)} />
          <div className="border-t border-line pt-3">
            <LanguageSwitcher />
          </div>
        </div>
      ) : null}
    </div>
  );
}
