import { describe, expect, it } from 'vitest';
import { canTransition, isTerminal, nextStage, RESEARCH_STATUSES } from './state-machine';

describe('research state-machine', () => {
  it('lists all 8 statuses', () => {
    expect(RESEARCH_STATUSES).toHaveLength(8);
    expect(RESEARCH_STATUSES).toContain('pending');
    expect(RESEARCH_STATUSES).toContain('failed');
    expect(RESEARCH_STATUSES).toContain('completed');
  });

  it('advances through the happy path', () => {
    expect(nextStage('pending')).toBe('discovering');
    expect(nextStage('discovering')).toBe('verifying');
    expect(nextStage('verifying')).toBe('scoring');
    expect(nextStage('scoring')).toBe('awaiting_selection');
    expect(nextStage('awaiting_selection')).toBe('developing');
    expect(nextStage('developing')).toBe('completed');
  });

  it('returns null for terminal statuses', () => {
    expect(nextStage('completed')).toBeNull();
    expect(nextStage('failed')).toBeNull();
  });

  it('allows forward transitions', () => {
    expect(canTransition('pending', 'discovering')).toBe(true);
    expect(canTransition('discovering', 'verifying')).toBe(true);
    expect(canTransition('discovering', 'awaiting_selection')).toBe(true); // mekanisme dua ramping
    expect(canTransition('verifying', 'scoring')).toBe(true);
    expect(canTransition('scoring', 'awaiting_selection')).toBe(true);
    expect(canTransition('awaiting_selection', 'developing')).toBe(true);
    expect(canTransition('developing', 'completed')).toBe(true);
  });

  it('allows failover to failed from any active stage', () => {
    for (const s of ['pending', 'discovering', 'verifying', 'scoring', 'awaiting_selection', 'developing'] as const) {
      expect(canTransition(s, 'failed')).toBe(true);
    }
  });

  it('rejects backward transitions', () => {
    expect(canTransition('verifying', 'discovering')).toBe(false);
    expect(canTransition('scoring', 'pending')).toBe(false);
    expect(canTransition('completed', 'developing')).toBe(false);
  });

  it('rejects transitions from terminal statuses', () => {
    expect(canTransition('completed', 'failed')).toBe(false);
    expect(canTransition('failed', 'pending')).toBe(false);
    expect(canTransition('completed', 'pending')).toBe(false);
  });

  it('identifies terminal statuses', () => {
    expect(isTerminal('completed')).toBe(true);
    expect(isTerminal('failed')).toBe(true);
    expect(isTerminal('pending')).toBe(false);
    expect(isTerminal('developing')).toBe(false);
  });
});
