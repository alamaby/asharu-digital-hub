import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import type { Locale } from '@/i18n/routing';
import { routing } from '@/i18n/routing';
import { buildMetadata } from '@/lib/seo/metadata';
import { isAdmin } from '@/lib/auth/is-admin';
import { createSupabaseService } from '@/lib/supabase/server';
import { Link } from '@/i18n/navigation';

interface PageProps {
  params: Promise<{ locale: string }>;
}

const STATUS_BG: Record<string, string> = {
  pending: 'bg-surface text-ink-muted',
  discovering: 'bg-blue-50 text-blue-800',
  verifying: 'bg-blue-50 text-blue-800',
  scoring: 'bg-blue-50 text-blue-800',
  awaiting_selection: 'bg-amber-50 text-amber-800',
  developing: 'bg-blue-50 text-blue-800',
  completed: 'bg-emerald-50 text-emerald-800',
  failed: 'bg-red-50 text-red-800'
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'admin.research' });
  return buildMetadata({
    locale: locale as Locale,
    path: '/admin/riset',
    title: t('title'),
    description: t('intro'),
    robots: { index: false, follow: false }
  });
}

export default async function ResearchListPage({ params }: PageProps) {
  const rawLocale = (await params).locale;
  const locale = (routing.locales.includes(rawLocale as Locale) ? rawLocale : routing.defaultLocale) as Locale;
  setRequestLocale(locale);

  if (!(await isAdmin())) {
    redirect({ href: '/masuk', locale });
  }

  const supabase = createSupabaseService();
  const t = await getTranslations({ locale, namespace: 'admin.research' });

  type SessionRow = {
    id: string;
    status: string;
    topic: string;
    platform_slug: string | null;
    created_at: string;
    error_message: string | null;
  };

  const { data: sessions } = supabase
    ? await supabase
        .from('content_research_sessions')
        .select('id, status, topic, platform_slug, created_at, error_message')
        .order('created_at', { ascending: false })
        .limit(50)
    : { data: null as SessionRow[] | null };

  const list = (sessions ?? []) as SessionRow[];

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <header>
        <h1 className="text-3xl font-bold tracking-tight text-ink sm:text-4xl">{t('title')}</h1>
        <p className="mt-2 text-sm text-ink-muted">{t('intro')}</p>
      </header>

      <ul className="mt-6 space-y-2">
        {list.length === 0 ? (
          <li className="rounded-xl border border-dashed border-line bg-surface p-6 text-center text-sm text-ink-muted">
            {t('empty')}
          </li>
        ) : (
          list.map((s) => (
            <li key={s.id}>
              <Link
                href={{ pathname: '/admin/riset/[sessionId]', params: { sessionId: s.id } }}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface p-4 shadow-card transition-colors hover:border-primary"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">{s.topic}</p>
                  <p className="text-xs text-ink-muted">
                    {s.platform_slug ?? '-'} · {new Date(s.created_at).toISOString().slice(0, 16).replace('T', ' ')}
                  </p>
                </div>
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                    STATUS_BG[s.status] ?? 'bg-surface text-ink-muted'
                  }`}
                >
                  {s.status}
                </span>
              </Link>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
