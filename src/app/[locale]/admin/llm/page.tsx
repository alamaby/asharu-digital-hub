import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import type { Locale } from '@/i18n/routing';
import { routing } from '@/i18n/routing';
import { buildMetadata } from '@/lib/seo/metadata';
import { createSupabaseService } from '@/lib/supabase/server';
import { isAdmin } from '@/lib/auth/is-admin';
import { ProviderBoard } from '@/components/admin/llm/ProviderBoard';
import { Link } from '@/i18n/navigation';

interface PageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'admin.llm' }).catch(() => ({}) as unknown as { toString: () => string });
  void t;
  return buildMetadata({
    locale: locale as Locale,
    path: '/admin/llm',
    title: 'LLM Providers',
    description: 'Kelola provider, model, key, dan logs LLM',
    robots: { index: false, follow: false }
  });
}

export default async function AdminLlmPage({ params }: PageProps) {
  const rawLocale = (await params).locale;
  const locale = (routing.locales.includes(rawLocale as Locale) ? rawLocale : routing.defaultLocale) as Locale;
  setRequestLocale(locale);

  if (!(await isAdmin())) {
    redirect({ href: '/masuk', locale });
  }

  const supabase = createSupabaseService();
  if (!supabase) {
    return <div className="mx-auto max-w-5xl px-4 py-10">Supabase not configured</div>;
  }

  const { data: providers } = await supabase.from('llm_providers').select('*').order('priority', { ascending: true });
  const provRows = (providers ?? []) as Array<{ id: string; slug: string; display_name: string; base_url: string; priority: number; is_active: boolean }>;

  // counts per provider
  const counts = new Map<string, { models: number; keys: number }>();
  for (const p of provRows) {
    const [{ count: mc }, { count: kc }] = await Promise.all([
      supabase.from('llm_models').select('*', { count: 'exact', head: true }).eq('provider_id', p.id).eq('is_active', true),
      supabase.from('llm_provider_keys').select('*', { count: 'exact', head: true }).eq('provider_id', p.id).eq('is_active', true)
    ]);
    counts.set(p.id, { models: mc ?? 0, keys: kc ?? 0 });
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-ink">LLM Providers</h1>
          <p className="mt-1 text-sm text-ink-muted">Drag ≡ untuk urutan fallback. Semua configurable by table.</p>
        </div>
        <div className="flex gap-2">
          <Link href={{ pathname: '/admin/llm/stages' }} className="rounded-lg border border-line bg-surface px-3 py-2 text-sm font-medium hover:border-primary">
            Stage Defaults
          </Link>
          <Link href={{ pathname: '/admin/llm/logs' }} className="rounded-lg border border-line bg-surface px-3 py-2 text-sm font-medium hover:border-primary">
            Lihat Logs Lengkap
          </Link>
        </div>
      </header>

      <div className="mt-8 rounded-xl border border-line bg-surface p-4 shadow-card">
        <ProviderBoard
          providers={provRows.map((p) => ({
            ...p,
            modelCount: counts.get(p.id)?.models ?? 0,
            keyCount: counts.get(p.id)?.keys ?? 0
          }))}
        />
      </div>

      <section className="mt-6 rounded-xl border border-dashed border-line bg-surface p-4 text-sm text-ink-muted">
        <p className="font-medium text-ink">Cara kerja:</p>
        <ul className="mt-1 list-disc pl-5">
          <li>Provider dicoba berurutan sesuai priority (kecil → besar).</li>
          <li>Per provider, model dicoba berurutan (priority + last_used_at RR). Gagal → next model.</li>
          <li>Per model, key dicoba berurutan (priority RR). 401/403/429 → next key & mark failure.</li>
          <li>Jika semua model di provider gagal → lanjut provider berikutnya.</li>
          <li>Reasoning max diset per model via config (checkbox di detail provider).</li>
        </ul>
      </section>
    </div>
  );
}
