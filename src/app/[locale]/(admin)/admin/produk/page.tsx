import type { Metadata } from 'next';
import { Suspense } from 'react';
import { setRequestLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import type { Locale } from '@/i18n/routing';
import { routing } from '@/i18n/routing';
import { buildMetadata } from '@/lib/seo/metadata';
import { isAdmin } from '@/lib/auth/is-admin';
import { createSupabaseService } from '@/lib/supabase/server';
import { getTranslations } from 'next-intl/server';
import { FeaturedProductBoard } from '@/components/admin/FeaturedProductBoard';
import { BoardSkeleton } from '@/components/admin/llm/ActionFeedback';
import { Link } from '@/i18n/navigation';
import {
  PRODUK_PAGE_SIZE,
  parseProdukFilter,
  clampPage,
  pageRange,
  buildSearchOr
} from '@/lib/admin/produk-query';

interface PageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ page?: string; q?: string; filter?: string }>;
}

interface AffiliateRow {
  id: string;
  friendly_code: string;
  name_id: string;
  merchant: string;
  category: string;
  image: string | null;
  url: string | null;
  is_active: boolean | null;
  is_featured: boolean;
  featured_override: boolean | null;
  featured_override_at: string | null;
  featured_rank: number;
  created_at: string;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'admin.produk' });
  return buildMetadata({
    locale: locale as Locale,
    path: '/admin/produk',
    title: t('title'),
    description: t('intro'),
    robots: { index: false, follow: false }
  });
}

async function ProdukSection({
  sp
}: {
  sp: { page?: string; q?: string; filter?: string };
}) {
  const supabase = createSupabaseService();
  if (!supabase) {
    return <p role="alert" className="text-sm text-red-700">Supabase not configured.</p>;
  }

  const q = (sp.q ?? '').trim().slice(0, 80);
  const filter = parseProdukFilter(sp.filter);

  // Query 1: hitung total agar bisa clamp halaman dengan benar.
  let countQuery = supabase
    .from('affiliate_products')
    .select('id', { count: 'exact', head: true })
    .neq('is_active', false)
    .order('featured_rank', { ascending: true })
    .order('created_at', { ascending: false });
  if (filter === 'pinned') countQuery = countQuery.eq('featured_override', true);
  if (filter === 'auto') countQuery = countQuery.is('featured_override', null).eq('is_featured', true);
  if (filter === 'excluded') countQuery = countQuery.eq('featured_override', false);
  const orCond = buildSearchOr(q);
  if (orCond) countQuery = countQuery.or(orCond);
  const totalCount = await countQuery.then(({ count }) => count ?? 0);

  const totalPages = Math.max(1, Math.ceil(totalCount / PRODUK_PAGE_SIZE));
  const page = clampPage(sp.page, totalPages);
  const { from, to } = pageRange(page);

  // Query 2: ambil slice halaman ini.
  let query = supabase
    .from('affiliate_products')
    .select('*', { count: 'exact' })
    .neq('is_active', false)
    .order('featured_rank', { ascending: true })
    .order('created_at', { ascending: false })
    .range(from, to);
  if (filter === 'pinned') query = query.eq('featured_override', true);
  if (filter === 'auto') query = query.is('featured_override', null).eq('is_featured', true);
  if (filter === 'excluded') query = query.eq('featured_override', false);
  if (orCond) query = query.or(orCond);
  const { data: rows } = await query;
  const items = (rows ?? []) as AffiliateRow[];

  // Query 3: kurasi count terpisah (bukan dari halaman, agar akurat).
  const { count: curatedCount } = await supabase
    .from('affiliate_products')
    .select('id', { count: 'exact', head: true })
    .neq('is_active', false)
    .eq('featured_override', true);

  return (
    <FeaturedProductBoard
      items={items}
      curatedCount={curatedCount ?? 0}
      page={page}
      totalPages={totalPages}
      totalCount={totalCount}
      q={q}
      filter={filter}
    />
  );
}

export default async function AdminProdukPage({ params, searchParams }: PageProps) {
  const rawLocale = (await params).locale;
  const locale = (routing.locales.includes(rawLocale as Locale) ? rawLocale : routing.defaultLocale) as Locale;
  setRequestLocale(locale);

  if (!(await isAdmin())) redirect({ href: '/masuk', locale });

  const sp = await searchParams;
  const tLoading = (await getTranslations({ locale, namespace: 'admin.produk' }))('loading');

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <div className="mb-4 text-sm">
        <Link href="/admin" className="text-primary hover:underline">← Dasbor</Link>
      </div>
      <h1 className="text-2xl font-bold text-ink">Kelola Produk Featured</h1>
      <p className="mt-1 text-sm text-ink-muted">
        Kurasi produk unggulan beranda &amp; katalog. Admin bisa mem-patok (featured tetap), mengembalikan ke default scraper, atau mengecualikan produk.
        Scraper harian tidak menimpa kurasi. Slot tampilan beranda tetap 6 produk teratas.
      </p>
      <Suspense fallback={<BoardSkeleton label={tLoading} />}>
        <ProdukSection sp={sp} />
      </Suspense>
    </div>
  );
}
