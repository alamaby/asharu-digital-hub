import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import type { Locale } from '@/i18n/routing';
import { routing } from '@/i18n/routing';
import { buildMetadata } from '@/lib/seo/metadata';
import { createSupabaseServer } from '@/lib/supabase/server';
import { ContentDraftCard } from '@/components/content/ContentDraftCard';

interface PageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'meta.konten.review' });
  return buildMetadata({
    locale: locale as Locale,
    path: '/konten/review',
    title: t('title'),
    description: t('description'),
    robots: { index: false, follow: false }
  });
}

export default async function ReviewPage({ params }: PageProps) {
  const rawLocale = (await params).locale;
  const locale = (routing.locales.includes(rawLocale as Locale) ? rawLocale : routing.defaultLocale) as Locale;
  setRequestLocale(locale);

  const supabase = await createSupabaseServer();
  if (!supabase) {
    redirect({ href: '/masuk', locale });
  }

  const {
    data: { user }
  } = await supabase!.auth.getUser();
  if (!user) {
    redirect({ href: '/masuk', locale });
  }

  // Check is_admin via profiles — single source of truth (migration
  // 20260901000001_consolidate_admin_auth.sql removed the hardcoded
  // email fallback that used to live here).
  const { data: profile } = await supabase!.from('profiles').select('is_admin').eq('id', user!.id).maybeSingle();
  const isAdmin = Boolean((profile as { is_admin?: boolean } | null)?.is_admin);
  if (!isAdmin) {
    redirect({ href: '/masuk', locale });
  }

  const t = await getTranslations({ locale, namespace: 'content.review' });

  // Fetch drafts
  const { data: drafts } = await supabase!
    .from('content_drafts')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50);

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-bold tracking-tight text-ink sm:text-4xl">{t('title')}</h1>
      <p className="mt-2 text-sm text-ink-muted">{t('realtime')}</p>

      <div className="mt-8 space-y-6">
        {!drafts || drafts.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line bg-surface px-6 py-12 text-center text-sm text-ink-muted">
            {t('empty')}
          </p>
        ) : (
          drafts.map((d) => (
            <ContentDraftCard
              key={(d as { id: string }).id}
              draft={d as unknown as { id: string; request_id: string; generated_thread: { main: { id: string; en: string }; replies: { id: string; en: string }[] }; affiliate_injections: { friendly_code: string; url: string; post_index: number }[]; status: string; llm_meta?: { provider: string; model: string } }}
            />
          ))
        )}
      </div>
    </div>
  );
}
