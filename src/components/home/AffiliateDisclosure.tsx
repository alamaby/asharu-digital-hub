import { Info } from 'lucide-react';
import { useTranslations } from 'next-intl';

/** Visible affiliate disclosure shown before any affiliate listing. */
export function AffiliateDisclosure({ id }: { id: string }) {
  const t = useTranslations('disclosure');
  return (
    <aside
      aria-labelledby={`${id}-title`}
      className="flex gap-3 rounded-xl border border-line bg-surface p-4"
    >
      <Info className="mt-0.5 size-5 shrink-0 text-accent" aria-hidden />
      <div>
        <h2 id={`${id}-title`} className="text-sm font-semibold text-ink">
          {t('title')}
        </h2>
        <p className="mt-1 text-sm text-ink-muted">{t('body')}</p>
      </div>
    </aside>
  );
}
