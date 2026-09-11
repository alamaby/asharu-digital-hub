import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import type { Locale } from '@/i18n/routing';
import { routing } from '@/i18n/routing';
import { buildMetadata } from '@/lib/seo/metadata';
import { createSupabaseService } from '@/lib/supabase/server';
import { createSupabaseServer } from '@/lib/supabase/server';
import { isAdmin } from '@/lib/auth/is-admin';
import { DashboardCards } from '@/components/admin/DashboardCards';

interface PageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'admin.dashboard' });
  return buildMetadata({
    locale: locale as Locale,
    path: '/admin',
    title: t('title'),
    description: t('intro'),
    robots: { index: false, follow: false }
  });
}

export default async function AdminDashboardPage({ params }: PageProps) {
  const rawLocale = (await params).locale;
  const locale = (routing.locales.includes(rawLocale as Locale) ? rawLocale : routing.defaultLocale) as Locale;
  setRequestLocale(locale);

  if (!(await isAdmin())) {
    redirect({ href: '/masuk', locale });
  }

  const supabase = createSupabaseService() ?? (await createSupabaseServer());
  const [{ count: pending }, { count: failed }, { count: needsReview }, { data: recentDrafts }] =
    supabase
      ? await Promise.all([
          supabase.from('content_requests').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
          supabase.from('content_requests').select('*', { count: 'exact', head: true }).eq('status', 'failed'),
          supabase.from('content_drafts').select('*', { count: 'exact', head: true }).eq('status', 'needs_review'),
          supabase
            .from('content_drafts')
            .select('id, request_id, status, created_at, generated_thread, affiliate_injections, llm_meta')
            .order('created_at', { ascending: false })
            .limit(5)
        ])
      : [{ count: 0 }, { count: 0 }, { count: 0 }, { data: null }];

  // Resolve topic text per draft via request_id
  const requestIds = (recentDrafts ?? [])
    .map((d) => (d as { request_id: string }).request_id)
    .filter((id): id is string => Boolean(id));
  const requestTopicById = new Map<string, string>();
  if (supabase && requestIds.length > 0) {
    const { data: reqs } = await supabase
      .from('content_requests')
      .select('id, topic')
      .in('id', requestIds);
    for (const r of (reqs ?? []) as { id: string; topic: string }[]) {
      requestTopicById.set(r.id, r.topic);
    }
  }

  const email = (await supabase?.auth.getUser().catch(() => ({ data: { user: null } })))?.data?.user?.email ?? '';

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <DashboardCards
        pending={pending ?? 0}
        failed={failed ?? 0}
        needsReview={needsReview ?? 0}
        email={email ?? ''}
        recentDrafts={((recentDrafts ?? []) as Array<{
          id: string;
          request_id: string;
          status: string;
          created_at: string;
          generated_thread: { main: { id: string; en: string }; replies: { id: string; en: string }[] };
          affiliate_injections: { friendly_code: string; post_index: number }[];
          llm_meta?: { provider: string; model: string };
        }>).map((d) => ({
          ...d,
          topic: requestTopicById.get(d.request_id) ?? ''
        }))}
      />
    </div>
  );
}
