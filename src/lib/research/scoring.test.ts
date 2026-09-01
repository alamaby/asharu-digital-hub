import { describe, expect, it } from 'vitest';
import { DEFAULT_SCORING_WEIGHTS } from './prompts';

describe('scoring weights', () => {
  it('all 8 aspects are present', () => {
    const keys = Object.keys(DEFAULT_SCORING_WEIGHTS);
    expect(keys).toHaveLength(8);
    expect(keys).toContain('freshness');
    expect(keys).toContain('localRelevance');
    expect(keys).toContain('practicalValue');
    expect(keys).toContain('curiosity');
    expect(keys).toContain('emotionalResonance');
    expect(keys).toContain('credibility');
    expect(keys).toContain('conversationPotential');
    expect(keys).toContain('brandRelevance');
  });

  it('weights sum to 1.0 (100%)', () => {
    const sum = Object.values(DEFAULT_SCORING_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1.0, 5);
  });

  it('all weights are positive', () => {
    for (const w of Object.values(DEFAULT_SCORING_WEIGHTS)) {
      expect(w).toBeGreaterThan(0);
    }
  });

  it('freshness, localRelevance, practicalValue, curiosity each 15%', () => {
    expect(DEFAULT_SCORING_WEIGHTS.freshness).toBe(0.15);
    expect(DEFAULT_SCORING_WEIGHTS.localRelevance).toBe(0.15);
    expect(DEFAULT_SCORING_WEIGHTS.practicalValue).toBe(0.15);
    expect(DEFAULT_SCORING_WEIGHTS.curiosity).toBe(0.15);
  });

  it('emotionalResonance 10%, conversationPotential 10%, brandRelevance 5%', () => {
    expect(DEFAULT_SCORING_WEIGHTS.emotionalResonance).toBe(0.10);
    expect(DEFAULT_SCORING_WEIGHTS.conversationPotential).toBe(0.10);
    expect(DEFAULT_SCORING_WEIGHTS.brandRelevance).toBe(0.05);
  });
});
