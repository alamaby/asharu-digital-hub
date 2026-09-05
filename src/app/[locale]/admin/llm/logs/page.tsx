import { setRequestLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import type { Locale } from '@/i18n/routing';
import { routing } from '@/i18n/routing';
import { createSupabaseService } from '@/lib/supabase/server';
import { isAdmin } from '@/lib/auth/is-admin';
import { Link } from '@/i18n/navigation';

interface PageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ provider?: string; status?: string; stage?: string; sort?: string; dir?: string; page?: string; tab?: string }>;
}

const PAGE_SIZE = 20;

export default async function LlmLogsPage({ params, searchParams }: PageProps) {
  const { locale: rawLocale } = await params;
  const locale = (routing.locales.includes(rawLocale as Locale) ? rawLocale : routing.defaultLocale) as Locale;
  setRequestLocale(locale);

  if (!(await isAdmin())) redirect({ href: '/masuk', locale });

  const sp = await searchParams;
  const tab = sp.tab === 'search' ? 'search' : 'llm';
  const providerFilter = sp.provider ?? 'all';
  const statusFilter = sp.status ?? 'all';
  const stageFilter = sp.stage ?? 'all';
  const sortBy = sp.sort === 'latency' ? 'latency_ms' : sp.sort === 'provider' ? 'provider_slug' : 'created_at';
  const dir = sp.dir === 'asc' ? true : false;
  const page = Math.max(1, Number.parseInt(sp.page ?? '1', 10) || 1);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const supabase = createSupabaseService();
  if (!supabase) return <div className="p-10">Supabase not configured</div>;

  if (tab === 'search') {
    let query = supabase.from('search_call_logs').select('*', { count: 'exact' }).order(sortBy, { ascending: dir }).order('id', { ascending: false }).range(from, to);
    if (providerFilter !== 'all') query = query.eq('provider_slug', providerFilter);
    if (statusFilter === 'success') query = query.eq('http_status', 200);
    if (statusFilter === 'error') query = query.or('http_status.is.null,http_status.neq.200');
    const { data: logs, count } = await query;
    const totalPages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));
    const { data: providers } = await supabase.from('search_call_logs').select('provider_slug').limit(200);
    const slugs = Array.from(new Set(((providers ?? []) as { provider_slug: string }[]).map((p) => p.provider_slug))).sort();
    return (
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <header className="space-y-3">
          <Link href={{ pathname: '/admin/llm' }} className="inline-flex items-center gap-1 text-sm text-primary underline">
            ← Providers
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-ink">Log Search Lengkap</h1>
            <p className="text-sm text-ink-muted">Request & hasil per search provider (generik: tavily / pengganti). Tab LLM untuk model.</p>
          </div>
          <div className="flex gap-2 text-sm">
            <Link href={{ pathname: '/admin/llm/logs', query: { tab: 'llm' } }} className="rounded border border-line px-3 py-1">LLM</Link>
            <span className="rounded bg-primary px-3 py-1 text-white">Search</span>
          </div>
        </header>
        <form className="mt-6 flex flex-wrap gap-2">
          <input type="hidden" name="tab" value="search" />
          <select name="provider" defaultValue={providerFilter} className="rounded border border-line px-2 py-1 text-sm">
            <option value="all">Semua provider</option>
            {slugs.map((s) => (<option key={s} value={s}>{s}</option>))}
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
                <th className="px-3 py-2">Provider / Op</th>
                <th className="px-3 py-2">Latency / HTTP</th>
                <th className="px-3 py-2">Hasil / Error</th>
              </tr>
            </thead>
            <tbody>
              {(logs ?? []).map((row) => {
                const r = row as { id: string; created_at: string; provider_slug: string; operation: string; session_id?: string | null; latency_ms?: number | null; http_status?: number | null; error?: string | null; query_count?: number | null; result_count?: number | null; queries?: unknown; request_payload?: unknown; response_summary?: unknown };
                return (
                  <tr key={r.id} className="border-t border-line align-top">
                    <td className="px-3 py-2 text-xs">{new Date(r.created_at).toLocaleString('id-ID')}</td>
                    <td className="px-3 py-2">
                      <div className="font-medium">{r.provider_slug} / {r.operation}</div>
                      {r.session_id ? <div className="font-mono text-[11px] text-ink-muted" title={r.session_id}>ses {r.session_id.slice(0, 8)}</div> : null}
                      <div className="text-xs text-ink-muted">q:{r.query_count ?? '-'} hasil:{r.result_count ?? '-'}</div>
                    </td>
                    <td className="px-3 py-2 text-xs">{r.latency_ms ?? '-'}ms / {r.http_status ?? '-'}</td>
                    <td className="px-3 py-2">
                      {r.error ? <span className="text-xs text-red-600">{r.error.slice(0, 400)}</span> : <span className="text-xs text-emerald-600">OK</span>}
                      <details className="mt-1">
                        <summary className="cursor-pointer text-xs text-primary">Queries / Payload</summary>
                        <pre className="mt-1 max-h-96 overflow-auto whitespace-pre-wrap break-words rounded bg-muted p-2 text-xs">{pretty(r.queries ?? r.request_payload ?? '—')}</pre>
                      </details>
                      <details className="mt-1">
                        <summary className="cursor-pointer text-xs text-primary">Ringkasan hasil</summary>
                        <pre className="mt-1 max-h-96 overflow-auto whitespace-pre-wrap break-words rounded bg-muted p-2 text-xs">{pretty(r.response_summary ?? '—')}</pre>
                      </details>
                    </td>
                  </tr>
                );
              })}
              {(!logs || logs.length === 0) ? (<tr><td colSpan={4} className="px-3 py-8 text-center text-sm text-ink-muted">Tidak ada log search</td></tr>) : null}
            </tbody>
          </table>
        </div>
        <div className="mt-4 flex items-center justify-between text-sm">
          <span className="text-ink-muted">Halaman {page} / {totalPages} · {count ?? 0} total</span>
          <div className="flex gap-2">
            {page > 1 ? <Link href={{ pathname: '/admin/llm/logs', query: { tab: 'search', provider: providerFilter, status: statusFilter, page: String(page - 1) } }} className="rounded border border-line px-3 py-1">Prev</Link> : null}
            {page < totalPages ? <Link href={{ pathname: '/admin/llm/logs', query: { tab: 'search', provider: providerFilter, status: statusFilter, page: String(page + 1) } }} className="rounded border border-line px-3 py-1">Next</Link> : null}
          </div>
        </div>
      </div>
    );
  }

  let query = supabase.from('llm_call_logs').select('*', { count: 'exact' }).order(sortBy, { ascending: dir }).order('id', { ascending: false }).range(from, to);
  if (providerFilter !== 'all') query = query.eq('provider_slug', providerFilter);
  if (statusFilter === 'success') query = query.eq('http_status', 200);
  if (statusFilter === 'error') query = query.or('http_status.is.null,http_status.neq.200');
  if (stageFilter !== 'all') query = query.eq('stage', stageFilter);

  const { data: logs, count } = await query;
  const totalPages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));

  const { data: stageRows } = await supabase.from('llm_call_logs').select('stage').limit(500);
  const stageOptions = Array.from(
    new Set(((stageRows ?? []) as { stage: string | null }[]).map((r) => r.stage).filter((s): s is string => Boolean(s)))
  ).sort();

  const { data: providers } = await supabase.from('llm_providers').select('slug').order('priority');
  const slugs = ((providers ?? []) as { slug: string }[]).map((p) => p.slug);

  function pretty(v: unknown): string {
    try {
      if (typeof v === 'string') {
        try { return JSON.stringify(JSON.parse(v), null, 2); } catch { return v; }
      }
      return JSON.stringify(v, null, 2);
    } catch {
      return String(v);
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <header className="space-y-3">
        <Link href={{ pathname: '/admin/llm' }} className="inline-flex items-center gap-1 text-sm text-primary underline">
          ← Providers
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-ink">LLM Logs Lengkap</h1>
          <p className="text-sm text-ink-muted">Request & response per provider/model/key. Filter, sorting & pagination DB-driven.</p>
        </div>
        <div className="flex gap-2 text-sm">
          <span className="rounded bg-primary px-3 py-1 text-white">LLM</span>
          <Link href={{ pathname: '/admin/llm/logs', query: { tab: 'search' } }} className="rounded border border-line px-3 py-1">Search</Link>
        </div>
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
        <select name="stage" defaultValue={stageFilter} className="rounded border border-line px-2 py-1 text-sm">
          <option value="all">Semua stage</option>
          {stageOptions.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <select name="sort" defaultValue={sortBy === 'latency_ms' ? 'latency' : sortBy === 'provider_slug' ? 'provider' : 'created_at'} className="rounded border border-line px-2 py-1 text-sm">
          <option value="created_at">Sort: Waktu</option>
          <option value="latency">Sort: Latency</option>
          <option value="provider">Sort: Provider</option>
        </select>
        <select name="dir" defaultValue={dir ? 'asc' : 'desc'} className="rounded border border-line px-2 py-1 text-sm">
          <option value="desc">Desc</option>
          <option value="asc">Asc</option>
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
              const r = row as { id: string; created_at: string; provider_slug: string; model_id: string; stage?: string | null; session_id?: string | null; request_id?: string | null; latency_ms?: number | null; http_status?: number | null; error?: string | null; key_hash?: string | null; request_messages?: unknown; response_text?: string | null; prompt_tokens?: number | null; completion_tokens?: number | null; total_tokens?: number | null; finish_reason?: string | null; is_fallback?: boolean | null };
              return (
                <tr key={r.id} className="border-t border-line align-top">
                  <td className="px-3 py-2 text-xs">{new Date(r.created_at).toLocaleString('id-ID')}</td>
                  <td className="px-3 py-2">
                    <div className="font-medium">{r.provider_slug}{r.is_fallback ? <span className="ml-1 rounded bg-amber-100 px-1 text-[10px] text-amber-800">fallback</span> : null}</div>
                    <div className="text-xs text-ink-muted">{r.model_id}</div>
                    {r.key_hash ? <div className="text-xs font-mono text-ink-muted">{r.key_hash}</div> : null}
                    <div className="text-xs text-ink-muted">p:{r.prompt_tokens ?? '-'} c:{r.completion_tokens ?? '-'} t:{r.total_tokens ?? '-'}</div>
                    {r.finish_reason ? <div className="text-xs text-ink-muted">finish:{r.finish_reason}</div> : null}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    <div>{r.stage ?? '-'}</div>
                    {r.session_id ? <div className="font-mono text-[11px] text-ink-muted" title={r.session_id}>ses {r.session_id.slice(0, 8)}</div> : null}
                    {r.request_id ? <div className="font-mono text-[11px] text-ink-muted" title={r.request_id}>req {r.request_id.slice(0, 8)}</div> : null}
                  </td>
                  <td className="px-3 py-2 text-xs">{r.latency_ms ?? '-'}ms / {r.http_status ?? '-'}</td>
                  <td className="px-3 py-2">
                    {r.error ? <span className="text-xs text-red-600">{r.error.slice(0, 400)}</span> : <span className="text-xs text-emerald-600">OK</span>}
                    <details className="mt-1">
                      <summary className="cursor-pointer text-xs text-primary">Request</summary>
                      <pre className="mt-1 max-h-96 overflow-auto whitespace-pre-wrap break-words rounded bg-muted p-2 text-xs">{pretty(r.request_messages ?? '—')}</pre>
                    </details>
                    <details className="mt-1">
                      <summary className="cursor-pointer text-xs text-primary">Response</summary>
                      <pre className="mt-1 max-h-96 overflow-auto whitespace-pre-wrap break-words rounded bg-muted p-2 text-xs">{pretty(r.response_text ?? r.error ?? '—')}</pre>
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
          {page > 1 ? <Link href={{ pathname: '/admin/llm/logs', query: { provider: providerFilter, status: statusFilter, stage: stageFilter, sort: sortBy === 'latency_ms' ? 'latency' : sortBy === 'provider_slug' ? 'provider' : 'created_at', dir: dir ? 'asc' : 'desc', page: String(page - 1) } }} className="rounded border border-line px-3 py-1">Prev</Link> : null}
          {page < totalPages ? <Link href={{ pathname: '/admin/llm/logs', query: { provider: providerFilter, status: statusFilter, stage: stageFilter, sort: sortBy === 'latency_ms' ? 'latency' : sortBy === 'provider_slug' ? 'provider' : 'created_at', dir: dir ? 'asc' : 'desc', page: String(page + 1) } }} className="rounded border border-line px-3 py-1">Next</Link> : null}
        </div>
      </div>
    </div>
  );
}
