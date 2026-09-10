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

export async function generateMetadata(): Promise<Metadata> {
  return buildMetadata({ locale: 'id' as Locale, path: '/admin/visual', title: 'Template Subjek Visual', description: 'Kelola template subjek untuk prompt awal visualisasi', robots: { index: false, follow: false } });
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

export default async function AdminVisualPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: rawLocale } = await params;
  const locale = (routing.locales.includes(rawLocale as Locale) ? rawLocale : routing.defaultLocale) as Locale;
  setRequestLocale(locale);
  if (!(await isAdmin())) redirect({ href: '/masuk', locale });

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <div className="mb-4 text-sm"><Link href={{ pathname: '/admin' }} className="text-primary hover:underline">← Dasbor</Link></div>
      <h1 className="text-2xl font-bold text-ink">Template Subjek Visual</h1>
      <p className="mt-1 text-sm text-ink-muted">
        Subjek untuk tombol &ldquo;Siapkan prompt awal&rdquo; di review (cover + balasan). Template aktif langsung tampil di picker review. Nonaktif = sembunyi tanpa hapus.
      </p>
      <div className="mt-6">
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
