import type { Metadata } from 'next';
import { Suspense } from 'react';
import { setRequestLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import type { Locale } from '@/i18n/routing';
import { routing } from '@/i18n/routing';
import { buildMetadata } from '@/lib/seo/metadata';
import { isAdmin } from '@/lib/auth/is-admin';
import { createSupabaseService } from '@/lib/supabase/server';
import { Link } from '@/i18n/navigation';
import { BoardSkeleton } from '@/components/admin/llm/ActionFeedback';
import { ImageModelBoard, ImageKeyBoard, type ImageProvider } from '@/components/admin/visual/ImageBoards';
import { AddImageModelForm, AddImageKeyForm, ImageBaseUrlForm, ImageAccountForm } from '@/components/admin/visual/ImageForms';

export async function generateMetadata(): Promise<Metadata> {
  return buildMetadata({ locale: 'id' as Locale, path: '/admin/visual/[providerId]', title: 'Detail Provider Image', description: 'Model, key, dan konfigurasi base URL provider image', robots: { index: false, follow: false } });
}

async function ModelsSection({ providerId, providerName }: { providerId: string; providerName: string }) {
  const supabase = createSupabaseService();
  if (!supabase) return <p role="alert" className="text-sm text-red-700">Supabase not configured.</p>;
  const { data: models, error } = await supabase
    .from('image_models')
    .select('*')
    .eq('provider_id', providerId)
    .order('priority', { ascending: true })
    .order('last_used_at', { ascending: true, nullsFirst: true });
  if (error) return <p role="alert" className="text-sm text-red-700">Gagal memuat model: {error.message}</p>;
  return (
    <>
      <ImageModelBoard providerId={providerId} providerName={providerName} models={(models ?? []) as never} />
      <AddImageModelForm providerId={providerId} />
    </>
  );
}

async function KeysSection({ providerId, providerSlug, providerName }: { providerId: string; providerSlug: string; providerName: string }) {
  const supabase = createSupabaseService();
  if (!supabase) return <p role="alert" className="text-sm text-red-700">Supabase not configured.</p>;
  const { data: keys, error } = await supabase
    .from('image_provider_keys')
    .select('*')
    .eq('provider_id', providerId)
    .order('priority', { ascending: true })
    .order('last_used_at', { ascending: true, nullsFirst: true });
  if (error) return <p role="alert" className="text-sm text-red-700">Gagal memuat key: {error.message}</p>;
  return (
    <>
      <ImageKeyBoard providerId={providerId} providerName={providerName} providerSlug={providerSlug} keys={(keys ?? []) as never} />
      <AddImageKeyForm providerId={providerId} providerSlug={providerSlug} />
    </>
  );
}

export default async function ProviderDetailPage({ params }: { params: Promise<{ locale: string; providerId: string }> }) {
  const { locale: rawLocale, providerId } = await params;
  const locale = (routing.locales.includes(rawLocale as Locale) ? rawLocale : routing.defaultLocale) as Locale;
  setRequestLocale(locale);
  if (!(await isAdmin())) redirect({ href: '/masuk', locale });

  const supabase = createSupabaseService();
  if (!supabase) return <div className="p-10">Supabase not configured</div>;
  const { data: provider } = await supabase.from('image_providers').select('*').eq('id', providerId).single();
  if (!provider) return <div className="mx-auto max-w-5xl p-10">Provider not found</div>;
  const prov = provider as ImageProvider;
  const accountId = prov.slug === 'cloudflare' ? (prov.config?.account_id ?? '') : null;

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <Link href={{ pathname: '/admin/visual' }} className="text-sm text-primary underline">
        ← Kembali ke Visual
      </Link>
      <header className="mt-3">
        <h1 className="text-2xl font-bold text-ink">
          {prov.display_name} <span className="text-sm font-normal text-ink-muted">({prov.slug}) #{prov.priority}</span>
        </h1>
        <p className="text-sm text-ink-muted">{prov.base_url} · {prov.is_active ? 'aktif' : 'nonaktif'}</p>
        <ImageBaseUrlForm providerId={prov.id} defaultValue={prov.base_url} />
        {accountId !== null ? <ImageAccountForm providerId={prov.id} defaultValue={accountId} /> : null}
      </header>

      <section className="mt-8 rounded-xl border border-line bg-surface p-4 shadow-card">
        <h2 className="mb-3 text-lg font-semibold text-ink">Models</h2>
        <Suspense fallback={<BoardSkeleton lines={5} label="Memuat model..." />}>
          <ModelsSection providerId={prov.id} providerName={prov.display_name} />
        </Suspense>
      </section>

      <section className="mt-6 rounded-xl border border-line bg-surface p-4 shadow-card">
        <h2 className="mb-3 text-lg font-semibold text-ink">Keys</h2>
        <p className="mt-1 text-sm text-ink-muted">Key tersimpan di Vault (hash + suffix tampil, key tidak pernah dibaca kembali).</p>
        <Suspense fallback={<BoardSkeleton lines={3} label="Memuat key..." />}>
          <KeysSection providerId={prov.id} providerSlug={prov.slug} providerName={prov.display_name} />
        </Suspense>
      </section>
    </div>
  );
}
