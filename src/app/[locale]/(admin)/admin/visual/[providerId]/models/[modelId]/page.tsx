import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import type { Locale } from '@/i18n/routing';
import { routing } from '@/i18n/routing';
import { buildMetadata } from '@/lib/seo/metadata';
import { isAdmin } from '@/lib/auth/is-admin';
import { createSupabaseService } from '@/lib/supabase/server';
import { Link } from '@/i18n/navigation';
import { ImageModelConfigForm } from '@/components/admin/visual/ImageForms';

export async function generateMetadata(): Promise<Metadata> {
  return buildMetadata({ locale: 'id' as Locale, path: '/admin/visual/[providerId]/models/[modelId]', title: 'Detail Model Image', description: 'Konfigurasi model image generation', robots: { index: false, follow: false } });
}

export default async function ModelDetailPage({ params }: { params: Promise<{ locale: string; providerId: string; modelId: string }> }) {
  const { locale: rawLocale, providerId, modelId } = await params;
  const locale = (routing.locales.includes(rawLocale as Locale) ? rawLocale : routing.defaultLocale) as Locale;
  setRequestLocale(locale);
  if (!(await isAdmin())) redirect({ href: '/masuk', locale });

  const supabase = createSupabaseService();
  if (!supabase) return <div className="p-10">Supabase not configured</div>;
  const { data, error } = await supabase
    .from('image_models')
    .select('model_id, display_name, is_default, config, image_providers!inner(slug, display_name)')
    .eq('id', modelId)
    .eq('provider_id', providerId)
    .maybeSingle();
  if (error || !data) return <div className="mx-auto max-w-5xl p-10">Model not found</div>;
  const row = data as unknown as {
    model_id: string;
    display_name: string;
    is_default: boolean;
    config: Record<string, unknown> | null;
    image_providers: { slug: string; display_name: string };
  };
  const configJson = row.config ? JSON.stringify(row.config, null, 2) : '{}';

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <Link href={{ pathname: '/admin/visual/[providerId]', params: { providerId } }} className="text-sm text-primary underline">
        ← {row.image_providers.display_name}
      </Link>
      <header className="mt-3">
        <h1 className="text-2xl font-bold text-ink">{row.display_name}</h1>
        <p className="text-sm text-ink-muted">{row.model_id} · provider {row.image_providers.slug}</p>
      </header>

      <section className="mt-8 rounded-xl border border-line bg-surface p-4 shadow-card">
        <h2 className="mb-3 text-lg font-semibold text-ink">Konfigurasi Model (cosmetic — belum dikonsumsi worker)</h2>
        <ImageModelConfigForm
          modelId={modelId}
          providerId={providerId}
          defaults={{ displayName: row.display_name, isDefault: row.is_default, configJson }}
        />
      </section>
    </div>
  );
}
