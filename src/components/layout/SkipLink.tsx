import { useTranslations } from 'next-intl';

export function SkipLink() {
  const t = useTranslations('header');
  return (
    <a
      href="#main-content"
      className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white"
    >
      {t('skipToContent')}
    </a>
  );
}
