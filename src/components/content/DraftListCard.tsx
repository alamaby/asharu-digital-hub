import Link from 'next/link';
import Image from 'next/image';
import { formatDateTime } from '@/lib/utils/format';
import { getDisplayTimezone } from '@/lib/auth/timezone';

export interface DraftListItem {
  id: string;
  status: string;
  created_at: string;
  generated_thread: { main: { id: string; en: string }; replies: { id: string; en: string }[] };
  affiliate_injections: { friendly_code: string; product_name_id?: string; product_image?: string; match_score?: number }[];
  llm_meta?: { provider: string; model: string };
}

const STATUS_CLASS: Record<string, string> = {
  needs_review: 'bg-amber-50 text-amber-800 border-amber-200',
  approved: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  rejected: 'bg-red-50 text-red-800 border-red-200'
};

export async function DraftListCard({ draft, locale }: { draft: DraftListItem; locale: string }) {
  const tz = await getDisplayTimezone();
  const snippet = draft.generated_thread.main.id.slice(0, 120) + (draft.generated_thread.main.id.length > 120 ? '…' : '');
  const inj = draft.affiliate_injections[0];
  const statusCls = STATUS_CLASS[draft.status] ?? 'bg-surface text-ink-muted border-line';

  return (
    <Link
      href={`/${locale}/konten/review/${draft.id}`}
      className="block rounded-xl border border-line bg-surface p-4 shadow-card transition-colors hover:border-primary"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${statusCls}`}>
          {draft.status}
        </span>
        <span className="text-xs text-ink-muted">{formatDateTime(draft.created_at, locale as 'id' | 'en', tz)}</span>
      </div>

      <p className="mt-2 text-sm text-ink line-clamp-2">{snippet}</p>

      <div className="mt-2 flex items-center gap-2 text-xs text-ink-muted">
        {inj ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2 py-0.5 font-medium text-primary">
            {inj.product_image ? (
              <Image src={inj.product_image} alt="" width={16} height={16} className="size-4 rounded object-cover" loading="lazy" />
            ) : null}
            ASH-{inj.friendly_code.replace('ASH-', '')}
            {inj.match_score !== undefined ? ` · ${inj.match_score}` : ''}
          </span>
        ) : null}
        {draft.llm_meta ? <span>{draft.llm_meta.provider} · {draft.llm_meta.model}</span> : null}
      </div>
    </Link>
  );
}
