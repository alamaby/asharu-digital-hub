import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { Locale } from '@/i18n/routing';
import { routing } from '@/i18n/routing';
import { Link } from '@/i18n/navigation';
import { buildMetadata } from '@/lib/seo/metadata';
import { ContentRequestForm } from '@/components/content/ContentRequestForm';
import { env } from '@/lib/env';

interface PageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'meta.konten.baru' });
  return buildMetadata({
    locale: locale as Locale,
    path: '/konten/baru',
    title: t('title'),
    description: t('description'),
    robots: { index: false, follow: false }
  });
}

export default async function KontenBaruPage({ params }: PageProps) {
  const rawLocale = (await params).locale;
  const locale = (routing.locales.includes(rawLocale as Locale) ? rawLocale : routing.defaultLocale) as Locale;
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: 'content.form' });
  const tNav = await getTranslations({ locale, namespace: 'content.form' });

  // Synthesize an "all platforms" option (slug='all') so users can request a
  // platform-agnostic draft. The form sends 'all' and the server stores NULL
  // in content_research_sessions.platform_slug (already nullable).
  const allPlatformsOption = { slug: 'all', display_name: t('platformAll') };

  // Fetch platforms for select — fallback to hardcoded if Supabase not configured
  let platforms: { slug: string; display_name: string }[] = [
    { slug: 'threads', display_name: 'Threads' },
    { slug: 'twitter', display_name: 'Twitter' },
    { slug: 'instagram', display_name: 'Instagram' },
    { slug: 'tiktok', display_name: 'TikTok' },
    { slug: 'linkedin', display_name: 'LinkedIn' },
    { slug: 'facebook', display_name: 'Facebook' }
  ];

  let categories: { slug: string; display_name: string }[] = [
    { slug: 'automotive', display_name: 'Otomotif' },
    { slug: 'electronics', display_name: 'Elektronik' },
    { slug: 'home-living', display_name: 'Rumah & Living' },
    { slug: 'fashion', display_name: 'Fashion' },
    { slug: 'sports-hobby', display_name: 'Olahraga & Hobi' },
    { slug: 'others', display_name: 'Lainnya' }
  ];

  if (env.hasSupabase) {
    try {
      const { createClient } = await import('@supabase/supabase-js');
      const supabase = createClient(env.supabaseUrl!, env.supabaseAnonKey!, { auth: { persistSession: false } });
      const { data } = await supabase.from('platforms').select('slug, display_name').eq('is_active', true).order('slug');
      if (data && data.length > 0) platforms = data as typeof platforms;
      const { data: catData } = await supabase.from('affiliate_products').select('category').eq('is_active', true);
      if (catData && catData.length > 0) {
        const distinct = Array.from(new Set((catData as { category: string }[]).map((r) => r.category).filter(Boolean))).sort();
        if (distinct.length > 0) {
          const labelMap: Record<string, string> = {
            automotive: 'Otomotif',
            electronics: 'Elektronik',
            'home-living': 'Rumah & Living',
            fashion: 'Fashion',
            'sports-hobby': 'Olahraga & Hobi',
            others: 'Lainnya'
          };
          categories = distinct.map((slug) => ({ slug, display_name: labelMap[slug] ?? slug }));
        }
      }
    } catch {
      // fallback to hardcoded
    }
  }

  // Prepend the synthetic "all" option.
  platforms = [allPlatformsOption, ...platforms];

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <div className="mb-4 flex items-center justify-between gap-3 text-sm">
        <Link
          href={{ pathname: '/admin' }}
          className="inline-flex items-center gap-1 text-ink-muted transition-colors hover:text-primary"
        >
          <span aria-hidden>←</span>
          {tNav('backToDashboard')}
        </Link>
        <Link
          href={{ pathname: '/admin/konten' }}
          className="text-ink-muted transition-colors hover:text-primary"
        >
          {tNav('goToList')}
        </Link>
      </div>
      <h1 className="text-3xl font-bold tracking-tight text-ink sm:text-4xl">{t('title')}</h1>
      <p className="mt-3 text-base leading-relaxed text-ink-muted">{t('intro')}</p>
      <div className="mt-8">
        <ContentRequestForm platforms={platforms} categories={categories} />
      </div>
    </div>
  );
}
