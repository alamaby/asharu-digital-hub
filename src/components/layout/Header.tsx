import { Link } from '@/i18n/navigation';
import { LanguageSwitcher } from './LanguageSwitcher';
import { MobileNav } from './MobileNav';
import { NavMenu } from './NavMenu';

export function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-surface/95 backdrop-blur">
      <div className="relative mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link
          href="/"
          className="rounded-md text-xl font-bold tracking-tight text-primary"
          aria-label="Asharu — asharu.id"
        >
          Asharu<span className="text-accent" aria-hidden>.</span>
        </Link>

        <div className="hidden md:block">
          <NavMenu variant="desktop" />
        </div>

        <div className="flex items-center gap-2">
          <span className="hidden md:inline-flex">
            <LanguageSwitcher />
          </span>
          <MobileNav />
        </div>
      </div>
    </header>
  );
}
