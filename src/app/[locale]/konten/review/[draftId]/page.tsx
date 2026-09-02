import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import type { Locale } from '@/i18n/routing';
import { routing } from '@/i18n/routing';
import { Link } from '@/i18n/navigation';
import { buildMetadata } from '@/lib/seo/metadata';
import { createSupabaseServer } from '@/lib/supabase/server';
import { ContentDraftCard } from '@/components/content/ContentDraftCard';
import { formatDateTime } from '@/lib/utils/format';
import { getDisplayTimezone } from '@/lib/auth/timezone';

interface PageProps {
  params: Promise<{ locale: string; draftId: string }>;
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

export default async function ReviewDetailPage({ params }: PageProps) {
  const { locale: rawLocale, draftId } = await params;
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

  const { data: profile } = await supabase!.from('profiles').select('is_admin').eq('id', user!.id).maybeSingle();
  const isAdmin = Boolean((profile as { is_admin?: boolean } | null)?.is_admin);
  if (!isAdmin) {
    redirect({ href: '/masuk', locale });
  }

  const t = await getTranslations({ locale, namespace: 'content.review' });

  const { data: draft } = await supabase!
    .from('content_drafts')
    .select('*')
    .eq('id', draftId)
    .maybeSingle();

  if (!draft) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <Link href={{ pathname: '/konten/review' }} className="text-sm text-primary hover:underline">
          ← {t('backToList')}
        </Link>
        <p className="mt-8 text-sm text-ink-muted">{t('notFound')}</p>
      </div>
    );
  }

  const d = draft as {
    id: string;
    request_id: string;
    generated_thread: { main: { id: string; en: string }; replies: { id: string; en: string }[] };
    affiliate_injections: Array<{
      id?: string;
      friendly_code: string;
      url: string;
      post_index: number;
      match_score?: number;
      match_signals?: Record<string, unknown>;
      product_name_id?: string;
      product_name_en?: string;
      product_image?: string;
      product_category?: string;
      product_merchant?: string;
    }>;
    status: string;
    llm_meta?: { provider: string; model: string };
    affiliate_match_score?: number | null;
    research_topic_id?: string | null;
  };

  // For drafts created before the injection JSON carried product name/image,
  // look up the affiliate product by friendly_code so the reviewer still sees
  // the product card with name + image.
  let enrichedInjections = d.affiliate_injections;
  const firstInj = d.affiliate_injections[0];
  if (firstInj && !firstInj.product_name_id && firstInj.friendly_code) {
    const { data: product } = await supabase!
      .from('affiliate_products')
      .select('friendly_code, name_id, name_en, image, category, merchant, url')
      .eq('friendly_code', firstInj.friendly_code)
      .maybeSingle();
    const p = product as { friendly_code: string; name_id: string; name_en: string; image: string; category: string; merchant: string; url: string } | null;
    if (p) {
      enrichedInjections = [{
        ...firstInj,
        product_name_id: p.name_id,
        product_name_en: p.name_en,
        product_image: p.image,
        product_category: p.category,
        product_merchant: p.merchant,
        url: firstInj.url || p.url
      }];
    }
  }

  const tz = await getDisplayTimezone();

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <div className="flex items-center justify-between gap-2">
        <Link href={{ pathname: '/konten/review' }} className="text-sm text-primary hover:underline">
          ← {t('backToList')}
        </Link>
        <span className="text-xs text-ink-muted">{formatDateTime(draft.created_at as string, locale, tz)}</span>
      </div>

      <div className="mt-4">
        <ContentDraftCard draft={{ ...d, affiliate_injections: enrichedInjections }} />
      </div>
    </div>
  );
}
