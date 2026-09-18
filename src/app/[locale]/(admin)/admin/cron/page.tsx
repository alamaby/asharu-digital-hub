import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import type { Locale } from '@/i18n/routing';
import { routing } from '@/i18n/routing';
import { buildMetadata } from '@/lib/seo/metadata';
import { isAdmin } from '@/lib/auth/is-admin';
import { createSupabaseService } from '@/lib/supabase/server';
import { getTranslations } from 'next-intl/server';
import { formatDateTimeSeconds } from '@/lib/utils/format';
import { getDisplayTimezone } from '@/lib/auth/timezone';
import { formatDurationMs, cronStatusTone, truncateBody, prettyJson } from '@/lib/admin/cron-view';
import { Link } from '@/i18n/navigation';

interface PageProps {
  params: Promise<{ locale: string }>;
}

interface CronJobRow {
  jobid: number;
  jobname: string;
  schedule: string;
  active: boolean;
  command_path: string | null;
  last_start: string | null;
  last_end: string | null;
  last_status: string | null;
  last_return_message: string | null;
  run_count: number;
}

interface CronRunRow {
  runid: number;
  status: string;
  return_message: string | null;
  start_time: string;
  end_time: string | null;
  duration_ms: number | null;
  http_status: number | null;
  http_timed_out: boolean | null;
  http_error: string | null;
  http_body: string | null;
  http_created: string | null;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'admin.cron' });
  return buildMetadata({
    locale: locale as Locale,
    path: '/admin/cron',
    title: t('title'),
    description: t('intro'),
    robots: { index: false, follow: false }
  });
}

function StatusBadge({ status }: { status: string }) {
  const tone = cronStatusTone(status);
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
      tone === 'success' ? 'bg-green-50 text-green-800' :
      tone === 'error' ? 'bg-red-50 text-red-800' :
      tone === 'warning' ? 'bg-amber-50 text-amber-800' :
      'bg-gray-100 text-gray-700 dark:bg-white/5 dark:text-white/80'
    }`}>
      {status ?? '—'}
    </span>
  );
}

export default async function AdminCronPage({ params }: PageProps) {
  const rawLocale = (await params).locale;
  const locale = (routing.locales.includes(rawLocale as Locale) ? rawLocale : routing.defaultLocale) as Locale;
  setRequestLocale(locale);

  if (!(await isAdmin())) redirect({ href: '/masuk', locale });

  const timeZone = await getDisplayTimezone();
  const fmt = (iso: string) => formatDateTimeSeconds(iso, locale, timeZone);
  const supabase = createSupabaseService();
  if (!supabase) throw new Error('Supabase not configured — set SUPABASE_SECRET_KEY');

  // Ambil overview jobs via RPC
  const { data: jobsRaw, error: jobsError } = await supabase.rpc('admin_cron_jobs');
  if (jobsError) {
    const t = await getTranslations({ locale, namespace: 'admin.cron' });
    return (
      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
        <div role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
          {t('loadError', { error: jobsError.message })}
        </div>
      </div>
    );
  }

  const jobs = ((jobsRaw ?? []) as CronJobRow[])
    .sort((a, b) => a.jobname.localeCompare(b.jobname));

  // Ambil runs per job secara paralel (max 50 per job).
  const runsByJob = new Map<number, CronRunRow[]>();
  try {
    const promises = jobs.map(async (job) => {
      const { data, error } = await supabase.rpc('admin_cron_runs', {
        p_jobid: job.jobid,
        p_limit: 50
      });
      if (error) console.error(`[cron] runs error for jobid ${job.jobid}:`, error.message);
      return { jobid: job.jobid, runs: (data ?? []) as CronRunRow[] };
    });
    const results = await Promise.all(promises);
    for (const r of results) runsByJob.set(r.jobid, r.runs);
  } catch (e) {
    console.error('[cron] runs fetch error:', e);
  }

  const t = await getTranslations({ locale, namespace: 'admin.cron' });

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <div className="mb-4 text-sm">
        <Link href="/admin" className="text-primary hover:underline">← Dasbor</Link>
      </div>
      <h1 className="text-2xl font-bold text-ink">{t('title')}</h1>
      <p className="mt-1 text-sm text-ink-muted">{t('intro')}</p>

      <div className="mt-6 space-y-6">
        {jobs.length === 0 ? (
          <p className="py-8 text-center text-sm text-ink-muted">{t('emptyRuns')}</p>
        ) : (
          jobs.map((job) => {
            const runs = runsByJob.get(job.jobid) ?? [];
            return (
              <details key={job.jobid} className="rounded-xl border border-line bg-surface">
                <summary className="cursor-pointer list-none px-6 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-semibold text-ink">{job.jobname}</span>
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${job.active ? 'bg-green-50 text-green-800' : 'bg-gray-100 text-gray-700'}`}>
                          {job.active ? t('active') : t('inactive')}
                        </span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-ink-muted">
                        <span className="font-mono">{job.schedule}</span>
                        {job.command_path ? <span>{job.command_path}</span> : null}
                        <span>{t('runCount', { count: job.run_count })}</span>
                        {job.last_start ? (
                          <span>
                            {t('colLastRun')}: {fmt(job.last_start)} · <StatusBadge status={job.last_status ?? ''} /> · {(job.last_end ? formatDurationMs((new Date(job.last_end).getTime() - new Date(job.last_start).getTime())) : null) ?? '—'}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </summary>
                <div className="border-t border-line px-6 py-4">
                  <p className="mb-3 text-xs text-ink-muted">{t('last50')}</p>
                  {runs.length === 0 ? (
                    <p className="py-4 text-center text-xs text-ink-muted">{t('emptyRuns')}</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-muted text-ink-muted">
                          <tr>
                            <th className="px-3 py-2">{t('colStart')}</th>
                            <th className="px-3 py-2">{t('colDuration')}</th>
                            <th className="px-3 py-2">{t('colCronStatus')}</th>
                            <th className="px-3 py-2">{t('colHttp')}</th>
                            <th className="px-3 py-2">{t('colReturn')}</th>
                            <th className="px-3 py-2 w-64">{t('colResponse')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {runs.map((run) => (
                            <tr key={run.runid} className="border-t border-line align-top">
                              <td className="whitespace-nowrap px-3 py-2 font-mono text-[11px]">
                                {fmt(run.start_time)}
                                {run.http_created && run.http_created !== run.start_time ? (
                                  <div className="text-ink-muted">→ {fmt(run.http_created)}</div>
                                ) : null}
                              </td>
                              <td className="px-3 py-2 text-ink-muted">
                                {run.duration_ms != null ? `${run.duration_ms} ms` : '—'}
                              </td>
                              <td className="px-3 py-2">
                                <StatusBadge status={run.status} />
                              </td>
                              <td className="px-3 py-2">
                                {run.http_status != null ? (
                                  <span className={`font-mono ${run.http_status >= 400 ? 'text-red-700' : 'text-green-700'}`}>
                                    {run.http_status}
                                  </span>
                                ) : (
                                  <span className="text-ink-muted" title={t('noHttpDetail')}>—</span>
                                )}
                                {run.http_timed_out ? <span className="ml-1 text-amber-700">(timeout)</span> : null}
                                {run.http_error ? <div className="text-red-600">{run.http_error.slice(0, 120)}</div> : null}
                              </td>
                              <td className="max-w-[200px] truncate px-3 py-2 text-ink-muted" title={run.return_message ?? undefined}>
                                {run.return_message ?? '—'}
                              </td>
                              <td className="px-3 py-2">
                                {run.http_body ? (
                                  <details className="text-[11px]">
                                    <summary className="cursor-pointer text-primary hover:underline">
                                      {truncateBody(run.http_body, 80)}
                                    </summary>
                                    <pre className="mt-1 max-h-64 overflow-auto rounded bg-muted p-2 whitespace-pre-wrap break-words">
                                      {prettyJson(run.http_body)}
                                    </pre>
                                  </details>
                                ) : (
                                  <span className="text-ink-muted" title={t('noHttpDetail')}>—</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  <p className="mt-3 text-[11px] text-ink-muted italic">{t('ttlNote')}</p>
                </div>
              </details>
            );
          })
        )}
      </div>
    </div>
  );
}
