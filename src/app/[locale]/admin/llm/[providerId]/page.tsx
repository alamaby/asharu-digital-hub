import { setRequestLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import type { Locale } from '@/i18n/routing';
import { routing } from '@/i18n/routing';
import { createSupabaseService } from '@/lib/supabase/server';
import { isAdmin } from '@/lib/auth/is-admin';
import { ModelBoard } from '@/components/admin/llm/ModelBoard';
import { KeyBoard } from '@/components/admin/llm/KeyBoard';
import { addModel, addBackupKey, updateProviderBaseUrl } from '@/lib/admin/llm-actions';
import { Link } from '@/i18n/navigation';

interface PageProps {
  params: Promise<{ locale: string; providerId: string }>;
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

  const [{ data: models }, { data: keys }] = await Promise.all([
    supabase.from('llm_models').select('*').eq('provider_id', providerId).order('priority', { ascending: true }).order('last_used_at', { ascending: true, nullsFirst: true }),
    supabase.from('llm_provider_keys').select('*').eq('provider_id', providerId).order('priority', { ascending: true }).order('last_used_at', { ascending: true, nullsFirst: true })
  ]);

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <Link href={{ pathname: '/admin/llm' }} className="text-sm text-primary underline">
        ← Kembali ke Providers
      </Link>
      <header className="mt-3">
        <h1 className="text-2xl font-bold text-ink">{prov.display_name} <span className="text-sm font-normal text-ink-muted">({prov.slug}) #{prov.priority}</span></h1>
        <p className="text-sm text-ink-muted">{prov.base_url} · {prov.is_active ? 'aktif' : 'nonaktif'}</p>
        <form action={updateProviderBaseUrl.bind(null, prov.id)} className="mt-3 flex max-w-xl gap-2">
          <input name="base_url" defaultValue={prov.base_url} className="flex-1 rounded border border-line px-2 py-1 text-sm" />
          <button type="submit" className="rounded bg-primary px-3 py-1 text-sm text-white">Simpan URL</button>
        </form>
      </header>

      <section className="mt-8 rounded-xl border border-line bg-surface p-4 shadow-card">
        <ModelBoard providerId={prov.id} models={(models ?? []) as never} />
        <form action={addModel.bind(null, prov.id)} className="mt-4 flex flex-wrap gap-2 rounded-lg border border-dashed border-line p-3">
          <input name="model_id" placeholder="model_id (exact)" className="min-w-[180px] flex-1 rounded border border-line px-2 py-1 text-sm" required />
          <input name="display_name" placeholder="display_name" className="min-w-[140px] flex-1 rounded border border-line px-2 py-1 text-sm" />
          <label className="flex items-center gap-1 text-xs"><input type="checkbox" name="reasoning" defaultChecked /> reasoning max</label>
          <button type="submit" className="rounded bg-primary px-3 py-1 text-sm text-white">Tambah Model</button>
        </form>
      </section>

      <section className="mt-6 rounded-xl border border-line bg-surface p-4 shadow-card">
        <KeyBoard providerId={prov.id} keys={(keys ?? []) as never} />
        <form action={addBackupKey.bind(null, prov.id)} className="mt-4 flex flex-wrap items-end gap-2 rounded-lg border border-dashed border-line p-3">
          <div className="min-w-[220px] flex-1">
            <label className="text-xs text-ink-muted">Tambah backup key ke provider ini</label>
            <input name="api_key" type="password" placeholder="sk-... / api key baru" className="mt-1 w-full rounded border border-line px-2 py-1 text-sm" required />
            <p className="mt-1 text-xs text-ink-muted">Akan disimpan ke Vault (hash ditampilkan, key tidak pernah dibaca kembali).</p>
          </div>
          <button type="submit" className="rounded bg-primary px-3 py-1 text-sm text-white">Add Backup Key</button>
        </form>
      </section>
    </div>
  );
}
