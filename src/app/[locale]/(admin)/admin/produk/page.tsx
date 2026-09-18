import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import type { Locale } from '@/i18n/routing';
import { routing } from '@/i18n/routing';
import { buildMetadata } from '@/lib/seo/metadata';
import { isAdmin } from '@/lib/auth/is-admin';
import { createSupabaseService } from '@/lib/supabase/server';
import { getTranslations } from 'next-intl/server';
import { FeaturedProductBoard } from '@/components/admin/FeaturedProductBoard';
import { Link } from '@/i18n/navigation';

interface PageProps {
  params: Promise<{ locale: string }>;
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

export default async function AdminProdukPage({ params }: PageProps) {
  const rawLocale = (await params).locale;
  const locale = (routing.locales.includes(rawLocale as Locale) ? rawLocale : routing.defaultLocale) as Locale;
  setRequestLocale(locale);

  if (!(await isAdmin())) redirect({ href: '/masuk', locale });

  const supabase = createSupabaseService();
  if (!supabase) throw new Error('Supabase not configured — set SUPABASE_SECRET_KEY');

  const { data: rows } = await supabase
    .from('affiliate_products')
    .select('*')
    .order('featured_rank', { ascending: true })
    .order('created_at', { ascending: false })
    .limit(500);

  const products = ((rows ?? []) as AffiliateRow[])
    .filter((r) => r.is_active !== false)
    .sort((a, b) => a.featured_rank - b.featured_rank || new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  const curatedCount = products.filter((r) => r.featured_override === true).length;

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
      <FeaturedProductBoard items={products} curatedCount={curatedCount} />
    </div>
  );
}
