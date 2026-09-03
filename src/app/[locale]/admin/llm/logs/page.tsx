import { setRequestLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import type { Locale } from '@/i18n/routing';
import { routing } from '@/i18n/routing';
import { createSupabaseService } from '@/lib/supabase/server';
import { isAdmin } from '@/lib/auth/is-admin';
import { Link } from '@/i18n/navigation';

interface PageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ provider?: string; status?: string; page?: string }>;
}

const PAGE_SIZE = 20;

export default async function LlmLogsPage({ params, searchParams }: PageProps) {
  const { locale: rawLocale } = await params;
  const locale = (routing.locales.includes(rawLocale as Locale) ? rawLocale : routing.defaultLocale) as Locale;
  setRequestLocale(locale);

  if (!(await isAdmin())) redirect({ href: '/masuk', locale });

  const sp = await searchParams;
  const providerFilter = sp.provider ?? 'all';
  const statusFilter = sp.status ?? 'all';
  const page = Math.max(1, Number.parseInt(sp.page ?? '1', 10) || 1);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const supabase = createSupabaseService();
  if (!supabase) return <div className="p-10">Supabase not configured</div>;

  let query = supabase.from('llm_call_logs').select('*', { count: 'exact' }).order('created_at', { ascending: false }).range(from, to);
  if (providerFilter !== 'all') query = query.eq('provider_slug', providerFilter);
  if (statusFilter === 'success') query = query.eq('http_status', 200);
  if (statusFilter === 'error') query = query.not('http_status', 'eq', 200 as never);

  const { data: logs, count } = await query;
  const totalPages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));

  const { data: providers } = await supabase.from('llm_providers').select('slug').order('priority');
  const slugs = ((providers ?? []) as { slug: string }[]).map((p) => p.slug);

  function jsonPreview(v: unknown): string {
    try {
      const s = typeof v === 'string' ? v : JSON.stringify(v);
      return s.slice(0, 2000);
    } catch {
      return String(v).slice(0, 2000);
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink">LLM Logs Lengkap</h1>
          <p className="text-sm text-ink-muted">Request & response per provider/model/key. Filter & pagination DB-driven.</p>
        </div>
        <Link href={{ pathname: '/admin/llm' }} className="text-sm text-primary underline">← Providers</Link>
      </header>

      <form className="mt-6 flex flex-wrap gap-2">
        <select name="provider" defaultValue={providerFilter} className="rounded border border-line px-2 py-1 text-sm">
          <option value="all">Semua provider</option>
          {slugs.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <select name="status" defaultValue={statusFilter} className="rounded border border-line px-2 py-1 text-sm">
          <option value="all">Semua status</option>
          <option value="success">Sukses (200)</option>
          <option value="error">Error</option>
        </select>
        <button type="submit" className="rounded bg-primary px-3 py-1 text-sm text-white">Filter</button>
      </form>

      <div className="mt-4 overflow-x-auto rounded-xl border border-line">
        <table className="w-full text-left text-sm">
          <thead className="bg-muted text-xs text-ink-muted">
            <tr>
              <th className="px-3 py-2">Waktu</th>
              <th className="px-3 py-2">Provider / Model</th>
              <th className="px-3 py-2">Stage</th>
              <th className="px-3 py-2">Latency / HTTP</th>
              <th className="px-3 py-2">Error</th>
            </tr>
          </thead>
          <tbody>
            {(logs ?? []).map((row) => {
              const r = row as { id: string; created_at: string; provider_slug: string; model_id: string; stage?: string | null; latency_ms?: number | null; http_status?: number | null; error?: string | null; key_hash?: string | null; request_messages?: unknown; response_text?: string | null; prompt_tokens?: number | null; completion_tokens?: number | null };
              return (
                <tr key={r.id} className="border-t border-line align-top">
                  <td className="px-3 py-2 text-xs">{new Date(r.created_at).toLocaleString('id-ID')}</td>
                  <td className="px-3 py-2">
                    <div className="font-medium">{r.provider_slug}</div>
                    <div className="text-xs text-ink-muted">{r.model_id}</div>
                    {r.key_hash ? <div className="text-xs font-mono text-ink-muted">{r.key_hash}</div> : null}
                    <div className="text-xs text-ink-muted">p:{r.prompt_tokens ?? '-'} c:{r.completion_tokens ?? '-'}</div>
                  </td>
                  <td className="px-3 py-2 text-xs">{r.stage ?? '-'}</td>
                  <td className="px-3 py-2 text-xs">{r.latency_ms ?? '-'}ms / {r.http_status ?? '-'}</td>
                  <td className="px-3 py-2">
                    {r.error ? <span className="text-xs text-red-600">{r.error.slice(0, 200)}</span> : <span className="text-xs text-emerald-600">OK</span>}
                    <details className="mt-1">
                      <summary className="cursor-pointer text-xs text-primary">Request/Response</summary>
                      <pre className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded bg-muted p-2 text-xs">{jsonPreview(r.request_messages ?? '—')}{'\n---\n'}{jsonPreview(r.response_text ?? '—')}</pre>
                    </details>
                  </td>
                </tr>
              );
            })}
            {(!logs || logs.length === 0) ? (
              <tr><td colSpan={5} className="px-3 py-8 text-center text-sm text-ink-muted">Tidak ada log</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex items-center justify-between text-sm">
        <span className="text-ink-muted">Halaman {page} / {totalPages} · {count ?? 0} total</span>
        <div className="flex gap-2">
          {page > 1 ? <Link href={{ pathname: '/admin/llm/logs', query: { provider: providerFilter, status: statusFilter, page: String(page - 1) } }} className="rounded border border-line px-3 py-1">Prev</Link> : null}
          {page < totalPages ? <Link href={{ pathname: '/admin/llm/logs', query: { provider: providerFilter, status: statusFilter, page: String(page + 1) } }} className="rounded border border-line px-3 py-1">Next</Link> : null}
        </div>
      </div>
    </div>
  );
}
