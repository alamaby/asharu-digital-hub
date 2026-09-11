import type { Metadata } from 'next';
import { Suspense } from 'react';
import { setRequestLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import type { Locale } from '@/i18n/routing';
import { routing } from '@/i18n/routing';
import { buildMetadata } from '@/lib/seo/metadata';
import { isAdmin } from '@/lib/auth/is-admin';
import { createSupabaseService } from '@/lib/supabase/server';
import { BoardSkeleton } from '@/components/admin/llm/ActionFeedback';
import { AddSubjectForm, type SubjectRow } from '@/components/admin/visual/SubjectForms';
import { SubjectBoard } from '@/components/admin/visual/SubjectBoard';
import { ImageProviderBoard, type ImageProvider } from '@/components/admin/visual/ImageBoards';

export async function generateMetadata(): Promise<Metadata> {
  return buildMetadata({ locale: 'id' as Locale, path: '/admin/visual', title: 'Visual & Image Generation', description: 'Kelola provider, model, key, dan template subjek image generation', robots: { index: false, follow: false } });
}

async function ImageProvidersSection() {
  const supabase = createSupabaseService();
  if (!supabase) {
    return <p role="alert" className="text-sm text-red-700">Supabase not configured.</p>;
  }
  const { data: providers, error } = await supabase.from('image_providers').select('*').order('priority', { ascending: true });
  if (error) {
    return <p role="alert" className="text-sm text-red-700">Gagal memuat provider image: {error.message}</p>;
  }
  const provRows = (providers ?? []) as ImageProvider[];
  if (provRows.length === 0) {
    return <p className="text-sm text-ink-muted">Belum ada provider.</p>;
  }
  const counts = new Map<string, { models: number; keys: number }>();
  for (const p of provRows) {
    const [{ count: mc }, { count: kc }] = await Promise.all([
      supabase.from('image_models').select('*', { count: 'exact', head: true }).eq('provider_id', p.id),
      supabase.from('image_provider_keys').select('*', { count: 'exact', head: true }).eq('provider_id', p.id)
    ]);
    counts.set(p.id, { models: mc ?? 0, keys: kc ?? 0 });
  }
  return (
    <ImageProviderBoard
      providers={provRows.map((p) => ({
        ...p,
        modelCount: counts.get(p.id)?.models ?? 0,
        keyCount: counts.get(p.id)?.keys ?? 0
      }))}
    />
  );
}

async function SubjectsSection() {
  const supabase = createSupabaseService();
  if (!supabase) {
    return <p role="alert" className="text-sm text-red-700">Supabase not configured.</p>;
  }
  const { data, error } = await supabase
    .from('image_subject_templates')
    .select('slug, display_name, subject_en, is_active, sort_order')
    .order('sort_order', { ascending: true })
    .order('slug');
  if (error) return <p role="alert" className="text-sm text-red-700">Gagal memuat template: {error.message}</p>;
  const rows = (data ?? []) as SubjectRow[];
  return <SubjectBoard subjects={rows} />;
}

export default async function AdminVisualPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: rawLocale } = await params;
  const locale = (routing.locales.includes(rawLocale as Locale) ? rawLocale : routing.defaultLocale) as Locale;
  setRequestLocale(locale);
  if (!(await isAdmin())) redirect({ href: '/masuk', locale });

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-ink">Visual &amp; Image Generation</h1>
          <p className="mt-1 text-sm text-ink-muted">
            Urutkan provider/model/key + template subyek. Klik <em>Kelola</em> pada provider untuk detail model &amp; key.
          </p>
        </div>
      </header>

      <div className="mt-8 rounded-xl border border-line bg-surface p-4 shadow-card">
        <h2 className="mb-3 text-lg font-semibold text-ink">Provider Image</h2>
        <Suspense fallback={<BoardSkeleton lines={5} label="Memuat provider..." />}>
          <ImageProvidersSection />
        </Suspense>
      </div>

      <section className="mt-8 rounded-xl border border-line bg-surface p-4 shadow-card">
        <h2 className="mb-3 text-lg font-semibold text-ink">Template Subjek</h2>
        <p className="mt-1 text-sm text-ink-muted">
          Template aktif muncul di picker review. Nonaktif = sembunyi. Drag ≡ untuk urutan.
        </p>
        <Suspense fallback={<BoardSkeleton lines={4} label="Memuat template..." />}>
          <SubjectsSection />
        </Suspense>
        <AddSubjectForm />
      </section>
    </div>
  );
}
