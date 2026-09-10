import { Suspense } from 'react';
import { setRequestLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import type { Locale } from '@/i18n/routing';
import { routing } from '@/i18n/routing';
import { createSupabaseService } from '@/lib/supabase/server';
import { isAdmin } from '@/lib/auth/is-admin';
import { ModelBoard } from '@/components/admin/llm/ModelBoard';
import { KeyBoard } from '@/components/admin/llm/KeyBoard';
import { AddKeyForm, AddModelForm, BaseUrlForm } from '@/components/admin/llm/LlmForms';
import { BoardSkeleton } from '@/components/admin/llm/ActionFeedback';
import { Link } from '@/i18n/navigation';

interface PageProps {
  params: Promise<{ locale: string; providerId: string }>;
}

async function ModelsSection({ providerId }: { providerId: string }) {
  const supabase = createSupabaseService();
  if (!supabase) return <p role="alert" className="text-sm text-red-700">Supabase not configured.</p>;
  const { data: models, error } = await supabase
    .from('llm_models')
    .select('*')
    .eq('provider_id', providerId)
    .order('priority', { ascending: true })
    .order('last_used_at', { ascending: true, nullsFirst: true });
  if (error) return <p role="alert" className="text-sm text-red-700">Gagal memuat model: {error.message}</p>;
  return (
    <>
      <ModelBoard providerId={providerId} models={(models ?? []) as never} />
      <AddModelForm providerId={providerId} />
    </>
  );
}

async function KeysSection({ providerId }: { providerId: string }) {
  const supabase = createSupabaseService();
  if (!supabase) return <p role="alert" className="text-sm text-red-700">Supabase not configured.</p>;
  const { data: keys, error } = await supabase
    .from('llm_provider_keys')
    .select('*')
    .eq('provider_id', providerId)
    .order('priority', { ascending: true })
    .order('last_used_at', { ascending: true, nullsFirst: true });
  if (error) return <p role="alert" className="text-sm text-red-700">Gagal memuat key: {error.message}</p>;
  return (
    <>
      <KeyBoard providerId={providerId} keys={(keys ?? []) as never} />
      <AddKeyForm providerId={providerId} />
    </>
  );
}

export default async function ProviderDetailPage({ params }: PageProps) {
  const { locale: rawLocale, providerId } = await params;
  const locale = (routing.locales.includes(rawLocale as Locale) ? rawLocale : routing.defaultLocale) as Locale;
  setRequestLocale(locale);

  if (!(await isAdmin())) {
    redirect({ href: '/masuk', locale });
  }
  const supabase = createSupabaseService();
  if (!supabase) return <div className="p-10">Supabase not configured</div>;

  const { data: provider } = await supabase.from('llm_providers').select('*').eq('id', providerId).single();
  if (!provider) return <div className="mx-auto max-w-5xl p-10">Provider not found</div>;
  const prov = provider as { id: string; slug: string; display_name: string; base_url: string; priority: number; is_active: boolean; config?: Record<string, string> };

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <Link href={{ pathname: '/admin/llm' }} className="text-sm text-primary underline">
        ← Kembali ke Providers
      </Link>
      <header className="mt-3">
        <h1 className="text-2xl font-bold text-ink">{prov.display_name} <span className="text-sm font-normal text-ink-muted">({prov.slug}) #{prov.priority}</span></h1>
        <p className="text-sm text-ink-muted">{prov.base_url} · {prov.is_active ? 'aktif' : 'nonaktif'}</p>
        <BaseUrlForm providerId={prov.id} defaultValue={prov.base_url} />
      </header>

      <section className="mt-8 rounded-xl border border-line bg-surface p-4 shadow-card">
        <Suspense fallback={<BoardSkeleton lines={5} label="Memuat model…" />}>
          <ModelsSection providerId={prov.id} />
        </Suspense>
      </section>

      <section className="mt-6 rounded-xl border border-line bg-surface p-4 shadow-card">
        <Suspense fallback={<BoardSkeleton lines={3} label="Memuat key…" />}>
          <KeysSection providerId={prov.id} />
        </Suspense>
      </section>
    </div>
  );
}
