import {
  Clock,
  Search,
  BadgeCheck,
  Star,
  Pause,
  Wrench,
  CheckCircle2,
  AlertTriangle
} from 'lucide-react';
import type { ResearchStatus } from '@/lib/research/state-machine';

export const STEP_ORDER: ResearchStatus[] = [
  'pending',
  'discovering',
  'verifying',
  'scoring',
  'awaiting_selection',
  'developing',
  'completed'
];

const STEP_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  pending: Clock,
  discovering: Search,
  verifying: BadgeCheck,
  scoring: Star,
  awaiting_selection: Pause,
  developing: Wrench,
  completed: CheckCircle2,
  failed: AlertTriangle
};

export type StepperLog = { stage: string; created_at: string; level?: string };

function formatTime(iso: string, locale: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString(locale === 'id' ? 'id-ID' : 'en-US', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch {
    return iso.slice(0, 16).replace('T', ' ');
  }
}

function getStepperTexts(t: (k: string, p?: Record<string, string | number>) => string) {
  return {
    label: (s: string) => {
      try {
        return t(`stepper.${s}`);
      } catch {
        return s;
      }
    }
  };
}

export function ResearchStepper({
  status,
  currentStageStartedAt,
  createdAt,
  logs,
  locale,
  t
}: {
  status: string;
  currentStageStartedAt: string | null;
  createdAt: string;
  logs: StepperLog[];
  locale: string;
  t: (key: string, params?: Record<string, string | number>) => string;
}) {
  const { label } = getStepperTexts(t);
  const isFailed = status === 'failed';

  // Opsi B: agregasi MIN(created_at) per stage dari logs
  const logTimeByStage = new Map<string, string>();
  for (const lg of [...logs].reverse()) {
    if (!logTimeByStage.has(lg.stage)) logTimeByStage.set(lg.stage, lg.created_at);
  }

  const activeIndex = isFailed
    ? (() => {
        // coba tebak stage gagal dari log error terakhir, fallback ke developing
        const errLog = logs.find((l) => l.level === 'error');
        const guessed = errLog?.stage ?? 'developing';
        const idx = STEP_ORDER.indexOf(guessed as ResearchStatus);
        return idx >= 0 ? idx : STEP_ORDER.length - 2;
      })()
    : STEP_ORDER.indexOf(status as ResearchStatus);

  const remaining = isFailed ? 0 : STEP_ORDER.length - 1 - Math.max(0, activeIndex);
  const isCompleted = status === 'completed';

  // ETA: untuk auto-stage, hitung elapsed dari currentStageStartedAt
  let etaLabel: string | null = null;
  if (!isFailed && !isCompleted) {
    if (status === 'awaiting_selection') {
      etaLabel = t('stepper.etaHumanGate');
    } else if (status === 'pending' || status === 'discovering' || status === 'verifying' || status === 'scoring' || status === 'developing') {
      if (currentStageStartedAt) {
        const elapsedMs = Date.now() - new Date(currentStageStartedAt).getTime();
        const elapsedMin = Math.floor(elapsedMs / 60000);
        // guard 5m + cron 10m ≈ 10 menit rata-rata
        if (elapsedMin < 2) etaLabel = t('stepper.etaSoon');
        else if (elapsedMin < 8) etaLabel = t('stepper.eta', { minutes: Math.max(1, 10 - elapsedMin) });
        else etaLabel = t('stepper.etaSoon');
      } else {
        etaLabel = t('stepper.eta', { minutes: 10 });
      }
    }
  }

  const getTimeForStep = (step: string, idx: number): string | null => {
    if (step === 'pending') return createdAt;
    const fromLog = logTimeByStage.get(step);
    if (fromLog) return fromLog;
    // fallback: jika step sudah lewat (idx < activeIndex) tapi belum ada log, pakai createdAt
    // jika step aktif, pakai currentStageStartedAt
    if (idx === activeIndex && currentStageStartedAt) return currentStageStartedAt;
    return null;
  };

  return (
    <div className="mt-6 rounded-xl border border-line bg-surface p-4 shadow-card">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-medium text-ink">
          {isFailed
            ? t('stepper.failedAt', { step: label(logs.find((l) => l.level === 'error')?.stage ?? 'developing') })
            : isCompleted
              ? t('stepper.stepsDone')
              : t('stepper.stepsRemaining', { count: remaining })}
        </p>
        {etaLabel ? (
          <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">{etaLabel}</span>
        ) : null}
      </div>

      <ol
        aria-label={t('stepper.ariaLabel')}
        className="flex items-start gap-0 overflow-x-auto pb-2 snap-x snap-mandatory"
      >
        {STEP_ORDER.map((step, idx) => {
          const isDone = !isFailed && idx < activeIndex;
          const isActive = idx === activeIndex;
          const isErrorNode = isFailed && isActive;
          const isAwaiting = step === 'awaiting_selection';
          const Icon = STEP_ICON[step] ?? Clock;
          const timeIso = getTimeForStep(step, idx);
          const isFuture = idx > activeIndex && !isFailed;

          // warna node: tetap amber untuk awaiting_selection (sesuai STATUS_BG)
          let nodeCls = 'bg-surface border-line text-ink-muted';
          if (isErrorNode) nodeCls = 'bg-red-50 border-red-300 text-red-700';
          else if (isActive && isAwaiting) nodeCls = 'bg-amber-50 border-amber-300 text-amber-800';
          else if (isActive) nodeCls = 'bg-primary/10 border-primary text-primary';
          else if (isDone && isAwaiting) nodeCls = 'bg-amber-500 border-amber-500 text-white';
          else if (isDone) nodeCls = 'bg-primary border-primary text-white';

          return (
            <li
              key={step}
              className="flex flex-1 flex-col items-center snap-center min-w-[88px] sm:min-w-0"
              aria-current={isActive ? 'step' : undefined}
            >
              <div className="flex w-full items-center">
                {/* konektor kiri */}
                <div
                  className={`hidden h-0.5 flex-1 sm:block ${idx === 0 ? 'invisible' : idx <= activeIndex && !isFailed ? 'bg-primary' : isDone ? 'bg-primary' : 'bg-line'}`}
                  aria-hidden
                />
                <div
                  className={`flex size-8 shrink-0 items-center justify-center rounded-full border-2 ${nodeCls} ${isActive && !isErrorNode ? 'motion-safe:animate-pulse' : ''}`}
                >
                  <Icon className="size-4" aria-hidden />
                </div>
                <div
                  className={`hidden h-0.5 flex-1 sm:block ${idx === STEP_ORDER.length - 1 ? 'invisible' : idx < activeIndex && !isFailed ? 'bg-primary' : 'bg-line'}`}
                  aria-hidden
                />
              </div>
              <p className={`mt-2 text-center text-xs font-medium leading-tight ${isActive ? 'text-ink' : isDone ? 'text-primary' : 'text-ink-muted'}`}>
                {label(step)}
              </p>
              {timeIso ? (
                <p className="mt-0.5 text-center text-[10px] leading-tight text-ink-muted">
                  {t('stepper.executedAt', { time: formatTime(timeIso, locale) })}
                </p>
              ) : isFuture ? (
                <p className="mt-0.5 text-center text-[10px] leading-tight text-ink-muted">—</p>
              ) : null}
            </li>
          );
        })}
      </ol>

      {/* konektor mobile fallback line di bawah node (sudah ada via flex, tapi pastikan scroll hint) */}
      <p className="mt-1 text-center text-[10px] text-ink-muted sm:hidden">← geser untuk melihat semua tahap →</p>
    </div>
  );
}
