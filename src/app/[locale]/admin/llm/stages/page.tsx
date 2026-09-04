import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import type { Locale } from '@/i18n/routing';
import { routing } from '@/i18n/routing';
import { buildMetadata } from '@/lib/seo/metadata';
import { isAdmin } from '@/lib/auth/is-admin';
import { createSupabaseService } from '@/lib/supabase/server';
import { Link } from '@/i18n/navigation';
import { upsertStageDefault } from '@/lib/admin/llm-actions';

export async function generateMetadata(): Promise<Metadata> {
  return buildMetadata({ locale: 'id' as Locale, path: '/admin/llm/stages', title: 'LLM Stage Defaults', description: 'Default provider/model per tahap riset', robots: { index: false, follow: false } });
}

export default async function StageDefaultsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: rawLocale } = await params;
  const locale = (routing.locales.includes(rawLocale as Locale) ? rawLocale : routing.defaultLocale) as Locale;
  setRequestLocale(locale);
  if (!(await isAdmin())) redirect({ href: '/masuk', locale });
  const supabase = createSupabaseService();
  if (!supabase) throw new Error('Supabase not configured — set SUPABASE_SECRET_KEY');
  const { data: defaults } = await supabase.from('llm_stage_defaults').select('stage, provider_id, model_id').order('stage');
  const { data: providers } = await supabase.from('llm_providers').select('id, slug, display_name').order('priority');
  const { data: models } = await supabase.from('llm_models').select('id, provider_id, model_id, display_name, priority, config').eq('is_active', true).order('priority');
  const t = await getTranslations({ locale, namespace: 'content.form' });
  const stageLabels: Record<string, string> = {
    idea_generation: t('stageLabel.idea_generation'),
    discovering: t('stageLabel.discovering'),
    verifying: t('stageLabel.verifying'),
    scoring: t('stageLabel.scoring'),
    developing: t('stageLabel.developing'),
    regen_affiliate: t('stageLabel.regen_affiliate')
  };
  const modelById = new Map((models ?? []).map((m: { id: string }) => [m.id, m]));
  const providerById = new Map((providers ?? []).map((p: { id: string }) => [p.id, p]));

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <div className="mb-4 text-sm"><Link href={{ pathname: '/admin/llm' }} className="text-primary hover:underline">← LLM Providers</Link></div>
      <h1 className="text-2xl font-bold text-ink">Default Model per Tahap</h1>
      <p className="mt-1 text-sm text-ink-muted">Kosongkan = pakai urutan global (priority/last_used). Jika stage punya default, semua sesi baru fallback ke sana kecuali admin override per-sesi di Buat Konten.</p>
      <div className="mt-6 space-y-3">
        {(defaults ?? []).map((row: { stage: string; provider_id: string | null; model_id: string | null }) => {
          const currentModel = row.model_id ? (modelById.get(row.model_id) as { id: string; provider_id: string; model_id: string; display_name: string } | undefined) : null;
          const currentProvider = row.provider_id ? (providerById.get(row.provider_id) as { display_name: string; slug: string } | undefined) : null;
          return (
            <form key={row.stage} action={upsertStageDefault} className="rounded-xl border border-line bg-surface p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-ink">{stageLabels[row.stage] ?? row.stage}</p>
                  <p className="text-xs text-ink-muted">{row.stage} {currentProvider ? `· ${currentProvider.display_name}` : ''} {currentModel ? `· ${currentModel.display_name} (${currentModel.model_id})` : '· default global'}</p>
                </div>
                <span className="text-xs text-ink-muted">{row.stage}</span>
              </div>
              <input type="hidden" name="stage" value={row.stage} />
              <div className="mt-3 flex flex-wrap gap-2">
                <label htmlFor={`stage-model-${row.stage}`} className="sr-only">Model</label>
                <select id={`stage-model-${row.stage}`} name="model_id" defaultValue={row.model_id ?? ''} className="min-w-[280px] rounded-lg border border-line bg-background px-3 py-2 text-sm text-ink">
                  <option value="">Default global (waterfall)</option>
                  {(models ?? []).map((m: { id: string; provider_id: string; model_id: string; display_name: string }) => {
                    const prov = providerById.get(m.provider_id) as { display_name: string; slug: string } | undefined;
                    return <option key={m.id} value={m.id}>{prov?.display_name ?? '?'} · {m.display_name} ({m.model_id})</option>;
                  })}
                </select>
                <button type="submit" className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90">Simpan</button>
              </div>
            </form>
          );
        })}
      </div>
    </div>
  );
}
