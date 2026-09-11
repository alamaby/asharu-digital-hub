import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';

/** Isi halaman 404 bersama untuk grup (public) dan (admin). */
export function NotFoundContent() {
  const t = useTranslations('notFound');
  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center px-4 py-20 text-center sm:px-6">
      <p className="text-6xl font-bold tracking-tight text-primary" aria-hidden>
        404
      </p>
      <h1 className="mt-4 text-2xl font-bold text-ink sm:text-3xl">{t('heading')}</h1>
      <p className="mt-3 max-w-md leading-relaxed text-ink-muted">{t('description')}</p>
      <Link href="/" className="btn-primary mt-8">
        {t('backHome')}
      </Link>
    </div>
  );
}
