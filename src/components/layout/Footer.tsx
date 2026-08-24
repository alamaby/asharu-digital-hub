import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { ConsentSettingsButton } from './ConsentSettingsButton';
import { LanguageSwitcher } from './LanguageSwitcher';

interface FooterProps {
  showAnalyticsPrefs: boolean;
}

export function Footer({ showAnalyticsPrefs }: FooterProps) {
  const t = useTranslations('footer');
  const tNav = useTranslations('nav');
  const tHeader = useTranslations('header');

  const navLinks = [
    { href: '/', label: tNav('home') },
    { href: '/products', label: tNav('products') },
    { href: '/properties', label: tNav('properties') },
    { href: '/about', label: tNav('about') }
  ] as const;

  return (
    <footer className="border-t border-line bg-surface">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:grid-cols-2 sm:px-6 lg:grid-cols-4">
        <div>
          <p className="text-lg font-bold text-primary">
            Asharu<span className="text-accent" aria-hidden>.</span>
          </p>
          <p className="mt-2 max-w-xs text-sm text-ink-muted">{t('tagline')}</p>
          <p className="mt-3 text-sm font-medium text-ink">asharu.id</p>
        </div>

        <nav aria-label={t('navHeading')}>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink">
            {t('navHeading')}
          </h2>
          <ul className="mt-3 space-y-1">
            {navLinks.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="inline-flex min-h-touch items-center text-sm text-ink-muted hover:text-primary"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink">
            {t('legalHeading')}
          </h2>
          <ul className="mt-3 space-y-1">
            <li>
              <Link
                href="/privacy-policy"
                className="inline-flex min-h-touch items-center text-sm text-ink-muted hover:text-primary"
              >
                {t('privacy')}
              </Link>
            </li>
            <li>
              <Link
                href="/affiliate-disclosure"
                className="inline-flex min-h-touch items-center text-sm text-ink-muted hover:text-primary"
              >
                {t('disclosureLink')}
              </Link>
            </li>
            {showAnalyticsPrefs ? (
              <li>
                <ConsentSettingsButton className="inline-flex min-h-touch items-center text-left text-sm text-ink-muted underline decoration-line underline-offset-4 hover:text-primary">
                  {t('consentSettings')}
                </ConsentSettingsButton>
              </li>
            ) : null}
          </ul>
        </div>

        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink">
            {tHeader('language')}
          </h2>
          <div className="mt-3">
            <LanguageSwitcher />
          </div>
        </div>
      </div>

      <div className="border-t border-line py-4">
        <p className="mx-auto max-w-6xl px-4 text-xs text-ink-muted sm:px-6">
          {t('rights', { year: new Date().getFullYear() })}
        </p>
      </div>
    </footer>
  );
}
