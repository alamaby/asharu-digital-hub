import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import type { Locale } from '@/i18n/routing';
import { routing } from '@/i18n/routing';
import { buildMetadata } from '@/lib/seo/metadata';
import { isAdmin } from '@/lib/auth/is-admin';
import { createSupabaseService } from '@/lib/supabase/server';
import { Link } from '@/i18n/navigation';
import { CameraAngleRowForm, type CameraAngleRow } from '@/components/admin/visual/CameraAngleForms';

export async function generateMetadata(): Promise<Metadata> {
  return buildMetadata({ locale: 'id' as Locale, path: '/admin/visual/angles/[angleSlug]', title: 'Detail Camera Angle', description: 'Edit template camera angle visual', robots: { index: false, follow: false } });
}

export default async function CameraAngleDetailPage({ params }: { params: Promise<{ locale: string; angleSlug: string }> }) {
  const { locale: rawLocale, angleSlug } = await params;
  const locale = (routing.locales.includes(rawLocale as Locale) ? rawLocale : routing.defaultLocale) as Locale;
  setRequestLocale(locale);
  if (!(await isAdmin())) redirect({ href: '/masuk', locale });

  const supabase = createSupabaseService();
  if (!supabase) return <div className="p-10">Supabase not configured</div>;
  const { data, error } = await supabase
    .from('image_camera_angles')
    .select('slug, display_name, angle_en, is_active, sort_order')
    .eq('slug', angleSlug)
    .maybeSingle();
  if (error || !data) return <div className="mx-auto max-w-5xl p-10">Template not found</div>;
  const row = data as CameraAngleRow;

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <Link href={{ pathname: '/admin/visual' }} className="text-sm text-primary underline">
        ← Visual &amp; Image Generation
      </Link>
      <header className="mt-3">
        <h1 className="text-2xl font-bold text-ink">{row.display_name}</h1>
        <p className="text-sm text-ink-muted">{row.slug} · {row.is_active ? 'aktif' : 'nonaktif'}</p>
      </header>

      <section className="mt-8 rounded-xl border border-line bg-surface p-4 shadow-card">
        <h2 className="mb-3 text-lg font-semibold text-ink">Edit Template Camera Angle</h2>
        <CameraAngleRowForm row={row} />
      </section>
    </div>
  );
}
