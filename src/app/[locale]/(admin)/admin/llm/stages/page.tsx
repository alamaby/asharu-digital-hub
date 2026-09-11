import type { Metadata } from 'next';
import { Suspense } from 'react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import type { Locale } from '@/i18n/routing';
import { routing } from '@/i18n/routing';
import { buildMetadata } from '@/lib/seo/metadata';
import { isAdmin } from '@/lib/auth/is-admin';
import { createSupabaseService } from '@/lib/supabase/server';
import { Link } from '@/i18n/navigation';
import { StageDefaultForm, type StageModelOption } from '@/components/admin/llm/LlmForms';
import { BoardSkeleton } from '@/components/admin/llm/ActionFeedback';

export async function generateMetadata(): Promise<Metadata> {
  return buildMetadata({ locale: 'id' as Locale, path: '/admin/llm/stages', title: 'LLM Stage Defaults', description: 'Default provider/model per tahap riset', robots: { index: false, follow: false } });
}

async function StagesSection({ locale }: { locale: Locale }) {
  const supabase = createSupabaseService();
  if (!supabase) return <p role="alert" className="text-sm text-red-700">Supabase not configured.</p>;
  const { data: defaults, error: defaultsError } = await supabase.from('llm_stage_defaults').select('stage, provider_id, model_id').order('stage');
  if (defaultsError) return <p role="alert" className="text-sm text-red-700">Gagal memuat stage: {defaultsError.message}</p>;
  const { data: providers } = await supabase.from('llm_providers').select('id, slug, display_name').order('priority');
  const { data: models } = await supabase.from('llm_models').select('id, provider_id, model_id, display_name, priority, config').eq('is_active', true).order('priority');
  const t = await getTranslations({ locale, namespace: 'content.form' });
  const stageLabels: Record<string, string> = {
    idea_generation: t('stageLabel.idea_generation'),
    discovering: t('stageLabel.discovering'),
    verifying: t('stageLabel.verifying'),
    scoring: t('stageLabel.scoring'),
    developing: t('stageLabel.developing'),
    regen_affiliate: t('stageLabel.regen_affiliate'),
    image_prompt: t('stageLabel.image_prompt'),
    enhance_image_prompt: t('stageLabel.enhance_image_prompt')
  };
  const modelList = (models ?? []) as Array<{ id: string; provider_id: string; model_id: string; display_name: string }>;
  const providerById = new Map(((providers ?? []) as Array<{ id: string; slug: string; display_name: string }>).map((p) => [p.id, p]));
  const modelById = new Map(modelList.map((m) => [m.id, m]));
  const options: StageModelOption[] = modelList.map((m) => ({
    id: m.id,
    provider_id: m.provider_id,
    model_id: m.model_id,
    display_name: m.display_name,
    providerName: providerById.get(m.provider_id)?.display_name ?? '?'
  }));

  return (
    <div className="mt-6 space-y-3">
      {((defaults ?? []) as Array<{ stage: string; provider_id: string | null; model_id: string | null }>).map((row) => {
        const currentModel = row.model_id ? modelById.get(row.model_id) : undefined;
        const currentProvider = row.provider_id ? providerById.get(row.provider_id) : undefined;
        const info = `${row.stage}${currentProvider ? ` · ${currentProvider.display_name}` : ''}${currentModel ? ` · ${currentModel.display_name} (${currentModel.model_id})` : ' · default global'}`;
        return (
          <StageDefaultForm
            key={row.stage}
            stage={row.stage}
            stageLabel={stageLabels[row.stage] ?? row.stage}
            currentInfo={info}
            currentModelId={row.model_id ?? ''}
            models={options}
          />
        );
      })}
    </div>
  );
}

export default async function StageDefaultsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: rawLocale } = await params;
  const locale = (routing.locales.includes(rawLocale as Locale) ? rawLocale : routing.defaultLocale) as Locale;
  setRequestLocale(locale);
  if (!(await isAdmin())) redirect({ href: '/masuk', locale });

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <div className="mb-4 text-sm"><Link href={{ pathname: '/admin/llm' }} className="text-primary hover:underline">← LLM Providers</Link></div>
      <h1 className="text-2xl font-bold text-ink">Default Model per Tahap</h1>
      <p className="mt-1 text-sm text-ink-muted">Kosongkan = pakai urutan global (priority/last_used). Jika stage punya default, semua sesi baru fallback ke sana kecuali admin override per-sesi di Buat Konten.</p>
      <Suspense fallback={<BoardSkeleton lines={8} label="Memuat stage…" />}>
        <StagesSection locale={locale} />
      </Suspense>
    </div>
  );
}
