import { describe, expect, it } from 'vitest';
import { applyReasoningOverride } from './completion';
import type { ModelParams } from './model-config';

describe('applyReasoningOverride', () => {
  it('tanpa override → params DB tidak berubah', () => {
    const p: ModelParams = { reasoningEffort: 'max', temperature: 0.7 };
    expect(applyReasoningOverride(p)).toBe(p);
    expect(applyReasoningOverride(p, null)).toBe(p);
    expect(applyReasoningOverride(p, undefined)).toBe(p);
  });

  it('override effort → timpa reasoning_effort DB', () => {
    expect(applyReasoningOverride({ reasoningEffort: 'max' }, 'low')).toEqual({ reasoningEffort: 'low' });
    expect(applyReasoningOverride({}, 'max')).toEqual({ reasoningEffort: 'max' });
  });

  it("override 'off' → matikan seluruh knob reasoning (effort + thinking)", () => {
    expect(
      applyReasoningOverride({ reasoningEffort: 'max', thinkingBudget: 1024, thinkingLevel: 'HIGH', temperature: 0.5 }, 'off')
    ).toEqual({ temperature: 0.5 });
  });

  it("override effort tidak menghapus thinking eksplisit DB (murni timpa effort saja)", () => {
    expect(applyReasoningOverride({ reasoningEffort: 'max', thinkingLevel: 'HIGH' }, 'low')).toEqual({
      reasoningEffort: 'low',
      thinkingLevel: 'HIGH'
    });
  });

  it('override tidak memodifikasi objek params input', () => {
    const p: ModelParams = { reasoningEffort: 'max' };
    applyReasoningOverride(p, 'off');
    expect(p).toEqual({ reasoningEffort: 'max' });
  });
});
