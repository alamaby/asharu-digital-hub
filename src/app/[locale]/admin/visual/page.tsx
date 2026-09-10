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
import { AddSubjectForm, SubjectRowForm, type SubjectRow } from '@/components/admin/visual/SubjectForms';
import { ImageKeyBoard, ImageModelBoard, ImageProviderBoard, type ImageKey, type ImageModel, type ImageProvider } from '@/components/admin/visual/ImageBoards';

export async function generateMetadata(): Promise<Metadata> {
  return buildMetadata({ locale: 'id' as Locale, path: '/admin/visual', title: 'Template Subjek Visual', description: 'Kelola template subjek dan provider/model/key image generation', robots: { index: false, follow: false } });
}

async function SubjectsSection() {
  const supabase = createSupabaseService();
  if (!supabase) return <p role="alert" className="text-sm text-red-700">Supabase not configured.</p>;
  const { data, error } = await supabase
    .from('image_subject_templates')
    .select('slug, display_name, subject_en, is_active, sort_order')
    .order('sort_order', { ascending: true })
    .order('slug');
  if (error) return <p role="alert" className="text-sm text-red-700">Gagal memuat template: {error.message}</p>;
  const rows = (data ?? []) as SubjectRow[];
  return (
    <div className="space-y-3">
      {rows.length === 0 ? <p className="text-sm text-ink-muted">Belum ada template.</p> : null}
      {rows.map((r) => (
        <SubjectRowForm key={r.slug} row={r} />
      ))}
    </div>
  );
}

async function ImageProvidersSection() {
  const supabase = createSupabaseService();
  if (!supabase) return <p role="alert" className="text-sm text-red-700">Supabase not configured.</p>;
  const { data, error } = await supabase.from('image_providers').select('*').order('priority', { ascending: true });
  if (error) return <p role="alert" className="text-sm text-red-700">Gagal memuat provider image: {error.message}</p>;
  const rows = (data ?? []) as ImageProvider[];
  if (rows.length === 0) return <p className="text-sm text-ink-muted">Belum ada provider image.</p>;
  return <ImageProviderBoard providers={rows} />;
}

async function ImageModelsSection() {
  const supabase = createSupabaseService();
  if (!supabase) return <p role="alert" className="text-sm text-red-700">Supabase not configured.</p>;
  const [{ data: providers }, { data: models, error }] = await Promise.all([
    supabase.from('image_providers').select('id, slug, display_name').order('priority', { ascending: true }),
    supabase.from('image_models').select('*').order('provider_id').order('priority', { ascending: true })
  ]);
  if (error) return <p role="alert" className="text-sm text-red-700">Gagal memuat model image: {error.message}</p>;
  const provs = (providers ?? []) as { id: string; slug: string; display_name: string }[];
  const byProvider = new Map<string, ImageModel[]>();
  for (const m of (models ?? []) as ImageModel[]) {
    const list = byProvider.get(m.provider_id) ?? [];
    list.push(m);
    byProvider.set(m.provider_id, list);
  }
  return (
    <div className="space-y-3">
      {provs.map((p) => (
        <ImageModelBoard key={p.id} providerId={p.id} providerName={p.display_name} models={byProvider.get(p.id) ?? []} />
      ))}
    </div>
  );
}

async function ImageKeysSection() {
  const supabase = createSupabaseService();
  if (!supabase) return <p role="alert" className="text-sm text-red-700">Supabase not configured.</p>;
  const [{ data: providers }, { data: keys, error }] = await Promise.all([
    supabase.from('image_providers').select('id, slug, display_name').order('priority', { ascending: true }),
    supabase.from('image_provider_keys').select('*').order('provider_id').order('priority', { ascending: true })
  ]);
  if (error) return <p role="alert" className="text-sm text-red-700">Gagal memuat key image: {error.message}</p>;
  const provs = (providers ?? []) as { id: string; slug: string; display_name: string }[];
  const byProvider = new Map<string, ImageKey[]>();
  for (const k of (keys ?? []) as ImageKey[]) {
    const list = byProvider.get(k.provider_id) ?? [];
    list.push(k);
    byProvider.set(k.provider_id, list);
  }
  return (
    <div className="space-y-3">
      {provs.map((p) => (
        <ImageKeyBoard key={p.id} providerId={p.id} providerName={p.display_name} providerSlug={p.slug} keys={byProvider.get(p.id) ?? []} />
      ))}
    </div>
  );
}

export default async function AdminVisualPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: rawLocale } = await params;
  const locale = (routing.locales.includes(rawLocale as Locale) ? rawLocale : routing.defaultLocale) as Locale;
  setRequestLocale(locale);
  if (!(await isAdmin())) redirect({ href: '/masuk', locale });

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <div className="mb-4 text-sm"><Link href={{ pathname: '/admin' }} className="text-primary hover:underline">← Dasbor</Link></div>
      <h1 className="text-2xl font-bold text-ink">Visual & Image Generation</h1>
      <p className="mt-1 text-sm text-ink-muted">
        Template subjek untuk tombol &ldquo;Siapkan prompt awal&rdquo; + urutan provider/model/key image generation (waterfall prioritas).
      </p>

      <h2 className="mt-8 text-lg font-semibold text-ink">Provider Image</h2>
      <div className="mt-3 rounded-xl border border-line bg-surface p-4 shadow-card">
        <Suspense fallback={<BoardSkeleton lines={5} label="Memuat provider image…" />}>
          <ImageProvidersSection />
        </Suspense>
      </div>

      <h2 className="mt-8 text-lg font-semibold text-ink">Model Image</h2>
      <Suspense fallback={<BoardSkeleton lines={5} label="Memuat model image…" />}>
        <ImageModelsSection />
      </Suspense>

      <h2 className="mt-8 text-lg font-semibold text-ink">Keys Image</h2>
      <p className="mt-1 text-sm text-ink-muted">Key tersimpan di Vault (hash + suffix tampil, key tidak pernah dibaca kembali).</p>
      <Suspense fallback={<BoardSkeleton lines={5} label="Memuat key image…" />}>
        <ImageKeysSection />
      </Suspense>

      <h2 className="mt-8 text-lg font-semibold text-ink">Template Subjek</h2>
      <p className="mt-1 text-sm text-ink-muted">
        Template aktif langsung tampil di picker review. Nonaktif = sembunyi tanpa hapus.
      </p>
      <div className="mt-3">
        <Suspense fallback={<BoardSkeleton lines={3} label="Memuat template…" />}>
          <SubjectsSection />
        </Suspense>
      </div>
      <div className="mt-6">
        <AddSubjectForm />
      </div>
    </div>
  );
}
