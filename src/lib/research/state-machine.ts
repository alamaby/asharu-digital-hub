/**
 * Pure state-machine for content research sessions.
 * Allowed transitions:
 *   pending          -> discovering
 *   discovering      -> verifying  | awaiting_selection (mekanisme dua, ramping) | failed
 *   verifying        -> scoring    | failed
 *   scoring          -> awaiting_selection | failed
 *   awaiting_selection -> developing | failed
 *   developing       -> completed  | failed
 */

export type ResearchStatus =
  | 'pending'
  | 'discovering'
  | 'verifying'
  | 'scoring'
  | 'awaiting_selection'
  | 'developing'
  | 'completed'
  | 'failed';

export const RESEARCH_STATUSES: readonly ResearchStatus[] = [
  'pending',
  'discovering',
  'verifying',
  'scoring',
  'awaiting_selection',
  'developing',
  'completed',
  'failed'
] as const;

const ALLOWED: Record<ResearchStatus, readonly ResearchStatus[]> = {
  pending: ['discovering', 'failed'],
  discovering: ['verifying', 'awaiting_selection', 'failed'],
  verifying: ['scoring', 'failed'],
  scoring: ['awaiting_selection', 'failed'],
  awaiting_selection: ['developing', 'failed'],
  developing: ['completed', 'failed'],
  completed: [],
  failed: []
};

export function canTransition(from: ResearchStatus, to: ResearchStatus): boolean {
  return ALLOWED[from]?.includes(to) ?? false;
}

export function nextStage(current: ResearchStatus): ResearchStatus | null {
  if (current === 'pending') return 'discovering';
  if (current === 'discovering') return 'verifying';
  if (current === 'verifying') return 'scoring';
  if (current === 'scoring') return 'awaiting_selection';
  if (current === 'awaiting_selection') return 'developing';
  if (current === 'developing') return 'completed';
  return null;
}

export function isTerminal(status: ResearchStatus): boolean {
  return status === 'completed' || status === 'failed';
}
