import { describe, expect, it } from 'vitest';
import { buildThinkingConfig, resolveModelParams } from './model-config';

describe('resolveModelParams', () => {
  it('returns empty for null config', () => {
    expect(resolveModelParams(null)).toEqual({});
  });

  it('maps 4 effort levels', () => {
    for (const eff of ['max', 'high', 'medium', 'low'] as const) {
      expect(resolveModelParams({ reasoning: true, reasoning_effort: eff }).reasoningEffort).toBe(eff);
    }
  });

  it('reasoning:true defaults to max', () => {
    expect(resolveModelParams({ reasoning: true }).reasoningEffort).toBe('max');
  });

  it('reasoning:false disables all reasoning', () => {
    expect(resolveModelParams({ reasoning: false, reasoning_effort: 'max' })).toEqual({});
  });

  it('reads explicit thinking_budget/level + temperature + max_tokens', () => {
    const p = resolveModelParams({
      reasoning: true,
      reasoning_effort: 'low',
      thinking_budget: 2048,
      thinking_level: 'medium',
      temperature: 0.3,
      max_tokens: 4000
    });
    expect(p).toEqual({
      reasoningEffort: 'low',
      thinkingBudget: 2048,
      thinkingLevel: 'MEDIUM',
      temperature: 0.3,
      maxTokens: 4000
    });
  });

  it('ignores invalid values fail-open', () => {
    const p = resolveModelParams({ reasoning_effort: 'ultra', thinking_budget: -5, temperature: 'hot' });
    expect(p.thinkingBudget).toBeUndefined();
    expect(p.temperature).toBeUndefined();
    // reasoning key absent → effort value invalid → no reasoning
    expect(p.reasoningEffort).toBeUndefined();
  });
});

describe('buildThinkingConfig', () => {
  it('returns undefined without reasoning', () => {
    expect(buildThinkingConfig({})).toBeUndefined();
  });

  it('maps effort to thinkingLevel (max/high→HIGH)', () => {
    expect(buildThinkingConfig({ reasoningEffort: 'max' })).toEqual({ thinkingLevel: 'HIGH' });
    expect(buildThinkingConfig({ reasoningEffort: 'high' })).toEqual({ thinkingLevel: 'HIGH' });
    expect(buildThinkingConfig({ reasoningEffort: 'medium' })).toEqual({ thinkingLevel: 'MEDIUM' });
    expect(buildThinkingConfig({ reasoningEffort: 'low' })).toEqual({ thinkingLevel: 'LOW' });
  });

  it('explicit level wins over budget and effort', () => {
    expect(buildThinkingConfig({ reasoningEffort: 'low', thinkingBudget: 512, thinkingLevel: 'HIGH' })).toEqual({
      thinkingLevel: 'HIGH'
    });
  });

  it('explicit budget wins over effort', () => {
    expect(buildThinkingConfig({ reasoningEffort: 'max', thinkingBudget: 1024 })).toEqual({ thinkingBudget: 1024 });
  });
});
