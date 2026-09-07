import type { ComponentType } from 'react';
import { FileText, Users, SlidersHorizontal } from 'lucide-react';

interface Labels {
  contentGroup: string;
  audienceGroup: string;
  controlGroup: string;
  hiddenNote: string;
}

interface SessionParams {
  topic: string | null;
  language: string | null;
  target_category: string | null;
  keywords: string | null;
  platformLabel: string;
  audience: string | null;
  audience_age: string | null;
  audience_interests: string[] | null;
  account_goal: string | null;
  purpose: string | null;
  cta_style: string | null;
  tone: string | null;
  target_location: string | null;
  secondary_location: string | null;
  constraints: string | null;
  allowed_categories: string[] | null;
  excluded_categories: string[] | null;
  freshness_hours: number | null;
  minimum_candidates: number | null;
  minimum_score: number | null;
  required_winners: number | null;
  maximum_iterations: number | null;
  target_reply_count: number | null;
  toneLabel: string;
  audienceAgeLabel: string;
  audienceInterestsLabel: string;
  secondaryLocationLabel: string;
  accountGoalLabel: string;
  allowedCategoriesLabel: string;
  excludedCategoriesLabel: string;
  freshnessHoursLabel: string;
  minimumCandidatesLabel: string;
  minimumScoreLabel: string;
  requiredWinnersLabel: string;
  maximumIterationsLabel: string;
  targetReplyCountLabel: string;
}

function Chip({ children }: { children: string }) {
  return (
    <span className="inline-flex items-center rounded-full border border-line bg-background px-2 py-0.5 text-[11px] text-ink">
      {children}
    </span>
  );
}

function Badge({ children }: { children: string }) {
  return (
    <span className="inline-flex min-w-8 items-center justify-center rounded-lg bg-primary/10 px-2 py-0.5 font-mono text-[11px] font-semibold text-primary">
      {children}
    </span>
  );
}

function Card({
  icon: Icon,
  title,
  children
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-line bg-surface p-4 shadow-card">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-ink">
        <span className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="size-4" aria-hidden />
        </span>
        {title}
      </h3>
      <dl className="mt-3 space-y-2.5 text-xs">{children}</dl>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[10px] font-medium uppercase tracking-wide text-ink-muted">{label}</dt>
      <dd className="mt-1 text-ink">{children}</dd>
    </div>
  );
}

export function ResearchParams({ s, labels }: { s: SessionParams; labels: Labels }) {
  let hidden = 0;
  const show = (v: unknown): boolean => {
    const visible = v !== null && v !== undefined && v !== '' && !(Array.isArray(v) && v.length === 0);
    if (!visible) hidden++;
    return visible;
  };

  const contentRows = (
    <>
      {show(s.topic) ? <Row label="Topic"><span className="text-sm font-medium">{s.topic}</span></Row> : null}
      {show(s.target_category) ? <Row label="Kategori target"><Chip>{s.target_category as string}</Chip></Row> : null}
      {show(s.keywords) ? <Row label="Keywords"><span className="break-words">{s.keywords}</span></Row> : null}
      <Row label="Bahasa">{s.language ?? '—'} · {s.platformLabel}</Row>
    </>
  );
  const audienceRows = (
    <>
      {show(s.audience) ? <Row label="Audiens">{s.audience}</Row> : null}
      {show(s.audience_age) ? <Row label={s.audienceAgeLabel}>{s.audience_age}</Row> : null}
      {show(s.audience_interests) ? (
        <Row label={s.audienceInterestsLabel}>
          <span className="flex flex-wrap gap-1">{(s.audience_interests as string[]).map((x) => <Chip key={x}>{x}</Chip>)}</span>
        </Row>
      ) : null}
      {show(s.account_goal) ? <Row label={s.accountGoalLabel}>{s.account_goal}</Row> : null}
      {show(s.purpose) ? <Row label="Tujuan">{s.purpose}</Row> : null}
      {show(s.cta_style) ? <Row label="CTA">{s.cta_style}</Row> : null}
      {show(s.tone) ? <Row label={s.toneLabel}>{s.tone}</Row> : null}
    </>
  );
  const controlRows = (
    <>
      {show(s.target_location) ? <Row label="Lokasi">{s.target_location}</Row> : null}
      {show(s.secondary_location) ? <Row label={s.secondaryLocationLabel}>{s.secondary_location}</Row> : null}
      {show(s.constraints) ? <Row label="Batasan"><span className="break-words">{s.constraints}</span></Row> : null}
      {show(s.allowed_categories) ? (
        <Row label={s.allowedCategoriesLabel}>
          <span className="flex flex-wrap gap-1">{(s.allowed_categories as string[]).map((x) => <Chip key={x}>{x}</Chip>)}</span>
        </Row>
      ) : null}
      {show(s.excluded_categories) ? (
        <Row label={s.excludedCategoriesLabel}>
          <span className="flex flex-wrap gap-1">{(s.excluded_categories as string[]).map((x) => <Chip key={x}>{x}</Chip>)}</span>
        </Row>
      ) : null}
      <div className="grid grid-cols-3 gap-1.5 pt-1 sm:grid-cols-6 lg:grid-cols-3 xl:grid-cols-6">
        {show(s.freshness_hours) ? <div><p className="text-[10px] uppercase tracking-wide text-ink-muted">{s.freshnessHoursLabel}</p><p className="mt-1"><Badge>{String(s.freshness_hours)}</Badge></p></div> : null}
        {show(s.minimum_candidates) ? <div><p className="text-[10px] uppercase tracking-wide text-ink-muted">{s.minimumCandidatesLabel}</p><p className="mt-1"><Badge>{String(s.minimum_candidates)}</Badge></p></div> : null}
        {show(s.minimum_score) ? <div><p className="text-[10px] uppercase tracking-wide text-ink-muted">{s.minimumScoreLabel}</p><p className="mt-1"><Badge>{String(s.minimum_score)}</Badge></p></div> : null}
        {show(s.required_winners) ? <div><p className="text-[10px] uppercase tracking-wide text-ink-muted">{s.requiredWinnersLabel}</p><p className="mt-1"><Badge>{String(s.required_winners)}</Badge></p></div> : null}
        {show(s.maximum_iterations) ? <div><p className="text-[10px] uppercase tracking-wide text-ink-muted">{s.maximumIterationsLabel}</p><p className="mt-1"><Badge>{String(s.maximum_iterations)}</Badge></p></div> : null}
        {show(s.target_reply_count) ? <div><p className="text-[10px] uppercase tracking-wide text-ink-muted">{s.targetReplyCountLabel}</p><p className="mt-1"><Badge>{String(s.target_reply_count)}</Badge></p></div> : null}
      </div>
    </>
  );

  return (
    <section className="mt-4 space-y-2">
      <div className="grid gap-2 lg:grid-cols-3">
        <Card icon={FileText} title={labels.contentGroup}>{contentRows}</Card>
        <Card icon={Users} title={labels.audienceGroup}>{audienceRows}</Card>
        <Card icon={SlidersHorizontal} title={labels.controlGroup}>{controlRows}</Card>
      </div>
      {hidden > 0 ? <p className="text-[11px] text-ink-muted">{labels.hiddenNote.replace('{count}', String(hidden))}</p> : null}
    </section>
  );
}
