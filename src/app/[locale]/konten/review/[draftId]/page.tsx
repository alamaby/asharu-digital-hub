import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import type { Locale } from '@/i18n/routing';
import { routing } from '@/i18n/routing';
import { Link } from '@/i18n/navigation';
import { buildMetadata } from '@/lib/seo/metadata';
import { createSupabaseServer } from '@/lib/supabase/server';
import { createSupabaseService } from '@/lib/supabase/server';
import { AdminTopBar } from '@/components/admin/AdminTopBar';
import { ContentDraftCard } from '@/components/content/ContentDraftCard';
import { DraftImageCard } from '@/components/content/DraftImageCard';
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

  // Link ke riset sumber via research_topic_id (draf legacy tanpa topik → disembunyikan).
  let sourceSessionId: string | null = null;
  if (d.research_topic_id) {
    const { data: topicRow } = await supabase!
      .from('content_research_topics')
      .select('session_id')
      .eq('id', d.research_topic_id)
      .maybeSingle();
    sourceSessionId = (topicRow as { session_id: string | null } | null)?.session_id ?? null;
  }

  // For regen_affiliate picker: fetch active providers/models (admin only, service client)
  let regenProviders: { id: string; slug: string; display_name: string }[] = [];
  let regenModels: { id: string; provider_id: string; model_id: string; display_name: string; priority: number; config: Record<string, unknown> | null }[] = [];
  // For image picker: active image providers/models/styles + draft image history
  let imageProviders: { id: string; slug: string; display_name: string }[] = [];
  let imageModels: { id: string; provider_id: string; model_id: string; display_name: string; provider_slug: string }[] = [];
  let imageStyles: { slug: string; display_name: string }[] = [];
  let draftImages: {
    id: string; draft_id: string; image_prompt: string; negative_prompt: string | null;
    style_slug: string | null; provider_slug: string; model_id: string; key_suffix: string | null;
    storage_path: string | null; public_url: string | null; width: number | null; height: number | null;
    status: 'pending' | 'ready' | 'failed' | 'selected'; last_error: string | null; attempts: number;
    llm_meta: Record<string, unknown> | null; created_at: string; updated_at: string;
  }[] = [];
  const svc = createSupabaseService();
  if (svc) {
    const { data: provs } = await svc.from('llm_providers').select('id, slug, display_name').eq('is_active', true).order('priority');
    const { data: mods } = await svc.from('llm_models').select('id, provider_id, model_id, display_name, priority, config').eq('is_active', true).order('priority');
    if (provs) regenProviders = provs as typeof regenProviders;
    if (mods) regenModels = mods as typeof regenModels;
    const { data: iprovs } = await svc.from('image_providers').select('id, slug, display_name').eq('is_active', true).order('priority');
    const { data: imods } = await svc
      .from('image_models')
      .select('id, provider_id, model_id, display_name, image_providers!inner(slug)')
      .eq('is_active', true)
      .order('priority');
    const { data: istlyes } = await svc.from('image_style_presets').select('slug, display_name').eq('is_active', true).order('slug');
    const { data: dimgs } = await svc.from('content_draft_images').select('*').eq('draft_id', draftId).order('created_at', { ascending: false });
    if (iprovs) imageProviders = iprovs as typeof imageProviders;
    if (imods) {
      imageModels = ((imods ?? []) as unknown as Array<{ id: string; provider_id: string; model_id: string; display_name: string; image_providers: { slug: string } }>).map(
        ({ image_providers: p, ...m }) => ({ ...m, provider_slug: p.slug })
      );
    }
    if (istlyes) imageStyles = istlyes as typeof imageStyles;
    if (dimgs) draftImages = dimgs as typeof draftImages;
  }

  return (
    <div>
      <AdminTopBar />
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link href={{ pathname: '/konten/review' }} className="text-sm text-primary hover:underline">
          ← {t('backToList')}
        </Link>
        <div className="flex items-center gap-3">
          {sourceSessionId ? (
            <Link
              href={{ pathname: '/admin/riset/[sessionId]', params: { sessionId: sourceSessionId } }}
              className="text-sm text-primary hover:underline"
            >
              {t('viewSourceResearch')} →
            </Link>
          ) : null}
          <span className="text-xs text-ink-muted">{formatDateTime(draft.created_at as string, locale, tz)}</span>
        </div>
      </div>

      <div className="mt-4">
        <ContentDraftCard draft={{ ...d, affiliate_injections: enrichedInjections }} regenProviders={regenProviders} regenModels={regenModels} />
        <DraftImageCard
          draftId={d.id}
          initialImages={draftImages}
          initialSelectedId={(draft as { selected_image_id?: string | null }).selected_image_id ?? null}
          options={{ providers: imageProviders, models: imageModels, styles: imageStyles }}
        />
      </div>
      </div>
    </div>
  );
}
