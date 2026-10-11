import { useTranslations } from 'next-intl';
import { SectionHeading } from '@/components/ui/SectionHeading';
import {
  DEMO_IS_SYNTHETIC,
  demoBrief,
  demoDraft,
  demoPublication,
  demoReview,
} from '@/lib/digital-hub/fixtures';
import type { ReviewSeverity } from '@/lib/digital-hub/types';

/**
 * Static sample-flow card: brief → draft → review → ready.
 * Synthetic fixtures only — never real customer data (see DEMO_IS_SYNTHETIC).
 */
export function SampleFlowCard() {
  const t = useTranslations('home');
  if (!DEMO_IS_SYNTHETIC) return null;
  const severityLabel: Record<ReviewSeverity, string> = {
    critical: t('sample.severityCritical'),
    major: t('sample.severityMajor'),
    minor: t('sample.severityMinor'),
  };
  const findingRows = [
    ...demoReview.unsupportedClaims.map((f) => `${severityLabel[f.severity]}: ${f.message}`),
    ...demoReview.missingContext,
  ];
  return (
    <div className="mt-8 rounded-2xl border border-line bg-surface p-6 shadow-card sm:p-8">
      <div className="mb-3 inline-block rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
        {t('sample.syntheticNote')}
      </div>
      <SectionHeading
        id="contoh-alur-heading"
        title={t('sample.heading')}
        description={t('sample.description')}
      />
      <ol className="mt-6 grid gap-4 sm:grid-cols-2">
        <li className="rounded-xl border border-line bg-surface/50 p-4">
          <h3 className="text-base font-semibold text-primary">{t('sample.stageBrief')}</h3>
          <p className="mt-1 text-sm leading-relaxed text-ink-muted">{demoBrief.keyMessage}</p>
          <p className="mt-2 text-sm text-ink-muted">{t('sample.briefFacts')}: {demoBrief.supportingFacts.join(', ')}</p>
          <p className="mt-1 text-sm text-ink-muted">{t('sample.briefEvidence')}: {demoBrief.requiredEvidence.join(', ')}</p>
        </li>
        <li className="rounded-xl border border-line bg-surface/50 p-4">
          <h3 className="text-base font-semibold text-primary">{t('sample.stageDraft')}</h3>
          <p className="mt-1 line-clamp-3 text-sm leading-relaxed text-ink-muted">{demoDraft.content}</p>
          <p className="mt-2 text-sm text-ink-muted">{t('sample.draftStatus')}: {demoDraft.reviewStatus}</p>
        </li>
        <li className="rounded-xl border border-line bg-surface/50 p-4">
          <h3 className="text-base font-semibold text-primary">{t('sample.stageReview')}</h3>
          <p className="mt-1 text-sm font-medium text-ink">{t('sample.reviewFindings')}</p>
          {findingRows.length > 0 ? (
            <ul className="mt-1 space-y-1">
              {findingRows.map((row) => (
                <li key={row} className="text-sm leading-relaxed text-ink-muted">• {row}</li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-sm text-ink-muted">{t('sample.noFindings')}</p>
          )}
          <p className="mt-2 text-sm text-ink-muted">{t('sample.reviewRecommendation')}: {demoReview.recommendations.join(', ')}</p>
        </li>
        <li className="rounded-xl border border-line bg-surface/50 p-4">
          <h3 className="text-base font-semibold text-primary">{t('sample.stageReady')}</h3>
          <p className="mt-1 text-sm text-ink-muted">{t('sample.readyMode')}: {demoPublication.publicationMode}</p>
          <p className="mt-1 text-sm text-ink-muted">{t('sample.readyApprover')}: {demoPublication.approvedBy}</p>
        </li>
      </ol>
    </div>
  );
}
