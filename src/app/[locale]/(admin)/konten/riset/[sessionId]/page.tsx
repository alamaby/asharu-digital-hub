import { setRequestLocale } from 'next-intl/server';
import type { Locale } from '@/i18n/routing';
import { routing } from '@/i18n/routing';
import { Link } from '@/i18n/navigation';
import { createSupabaseServer } from '@/lib/supabase/server';
import { isAdmin } from '@/lib/auth/is-admin';
import { RetryOwnSessionButton } from '@/components/content/RetryOwnSessionButton';

interface PageProps {
  params: Promise<{ locale: string; sessionId: string }>;
}

export default async function ResearchStatusPage({ params }: PageProps) {
  const { locale: rawLocale, sessionId } = await params;
  const locale = (routing.locales.includes(rawLocale as Locale) ? rawLocale : routing.defaultLocale) as Locale;
  setRequestLocale(locale);

  const supabase = await createSupabaseServer();
  if (!supabase) return <div className="p-10 text-sm">Service unavailable</div>;
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        <p className="text-sm">Login diperlukan untuk melihat status riset.</p>
        <Link href={{ pathname: '/masuk' }} className="text-sm text-primary underline">Masuk →</Link>
      </div>
    );
  }

  const { data: session } = await supabase
    .from('content_research_sessions')
    .select('id, status, topic, error_message, created_at, updated_at')
    .eq('id', sessionId)
    .maybeSingle();
  const s = session as { id: string; status: string; topic: string | null; error_message: string | null } | null;
  if (!s) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        <p className="text-sm text-ink-muted">Riset tidak ditemukan atau bukan milik Anda.</p>
      </div>
    );
  }

  const { data: logs } = await supabase
    .from('content_research_logs')
    .select('stage, level, message, created_at')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: false })
    .limit(20);
  const list = (logs ?? []) as Array<{ stage: string; level: string; message: string }>;
  const fallbackNote = list.find((l) => l.level === 'warn' && /fallback|Model pilihan/i.test(l.message));

  const retryable = ['failed', 'awaiting_selection', 'completed'].includes(s.status);
  const admin = await isAdmin().catch(() => false);

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <Link href={{ pathname: '/konten/baru' }} className="text-sm text-ink-muted hover:text-primary">← Buat riset baru</Link>
      <h1 className="mt-2 text-2xl font-bold text-ink">{s.topic ?? `Riset ${s.id.slice(0, 8)}`}</h1>
      <p className="mt-2 text-sm text-ink-muted">Status: <span className="font-semibold text-ink">{s.status}</span></p>
      {fallbackNote ? (
        <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Model yang dipilih sempat error/kosong sehingga otomatis diganti model lain ({fallbackNote.message.slice(0, 220)}).
        </p>
      ) : null}
      {s.status === 'failed' && s.error_message ? (
        <div className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
          <p className="font-medium">Riset gagal di tahap discovering.</p>
          <p className="mt-1">{s.error_message}</p>
          <p className="mt-1 text-xs">Klik Ulangi Riset — pencarian Tavily dan LLM akan dijalankan ulang tanpa membuat form baru.</p>
        </div>
      ) : null}
      {retryable ? <RetryOwnSessionButton sessionId={sessionId} /> : null}
      {admin ? (
        <p className="mt-3 text-xs">
          <Link href={{ pathname: '/admin/riset/[sessionId]', params: { sessionId } }} className="text-primary hover:underline">
            Lihat detail admin →
          </Link>
        </p>
      ) : null}
      <section className="mt-6">
        <h2 className="text-sm font-semibold text-ink">Log terakhir</h2>
        <ol className="mt-2 space-y-2">
          {list.map((l, i) => (
            <li key={i} className="rounded-lg border border-line bg-surface p-2 text-xs text-ink-muted">
              [{l.stage}] {l.level} — {l.message.slice(0, 300)}
            </li>
          ))}
          {list.length === 0 ? <li className="text-xs text-ink-muted">Belum ada log.</li> : null}
        </ol>
      </section>
    </div>
  );
}
