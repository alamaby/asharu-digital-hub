import { useTranslations } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { Metadata } from 'next';
import { Link } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';
import { env } from '@/lib/env';

interface NotFoundPageProps {
  params?: Promise<{ locale: string }>;
}

async function resolveLocale(params?: NotFoundPageProps['params']): Promise<string> {
  if (!params) return routing.defaultLocale;
  const { locale } = await params;
  return routing.locales.includes(locale as never) ? locale : routing.defaultLocale;
}

export async function generateMetadata({ params }: NotFoundPageProps): Promise<Metadata> {
  const t = await getTranslations({
    locale: await resolveLocale(params),
    namespace: 'meta.notFound'
  });
  return {
    metadataBase: new URL(env.siteUrl),
    title: t('title'),
    description: t('description'),
    robots: { index: false, follow: false }
  };
}

export default async function NotFoundPage({ params }: NotFoundPageProps) {
  setRequestLocale(await resolveLocale(params));
  return <NotFoundContent />;
}

function NotFoundContent() {
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
