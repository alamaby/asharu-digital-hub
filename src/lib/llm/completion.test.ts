import { describe, expect, it, vi } from 'vitest';
import { applyReasoningOverride, runLLMCompletion } from './completion';
import type { ModelParams } from './model-config';

const hoisted = vi.hoisted(() => ({
  chatFn: vi.fn()
}));

vi.mock('./registry', () => ({
  ProviderRegistry: class {
    async listActive() {
      return [{ id: 'prov-1', slug: 'prov-test', base_url: 'https://llm.test', is_active: true, priority: 1 }];
    }
  }
}));

vi.mock('@/lib/supabase/vault', () => ({
  fetchOrderedModels: async () => [
    { id: 'm1', model_id: 'model-1', config: null },
    { id: 'm2', model_id: 'model-2', config: null }
  ],
  pickDefaultModel: async () => 'model-1',
  markModelFailure: vi.fn(),
  markModelUsage: vi.fn()
}));

vi.mock('./key-pool', () => ({
  KeyPool: class {
    async withFallback<T>(fn: (apiKey: string, keyRow: { key_suffix: string }) => Promise<T>) {
      return { result: await fn('key-123', { key_suffix: '123' } as never), keyRow: { key_suffix: '123' } as never };
    }
  }
}));

vi.mock('./providers/openai-compatible', () => ({
  OpenAICompatibleProvider: class {
    chat(...args: unknown[]) {
      return hoisted.chatFn(...args);
    }
  }
}));

vi.mock('@/lib/notifications/error-events', () => ({
  reportError: vi.fn()
}));

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

describe('runLLMCompletion deadline', () => {
  it('deadlineMs override respected', async () => {
    let currentTime = 1_000_000;
    const nowSpy = vi.spyOn(Date, 'now').mockImplementation(() => currentTime);

    hoisted.chatFn.mockImplementation(async () => {
      // Simulasi provider lambat: advance waktu 1500ms lalu gagal attempt
      currentTime += 1500;
      throw new Error('slow provider attempt failed');
    });

    const fakeClient = {
      from: () => ({
        insert: () => Promise.resolve({ error: null })
      })
    } as never;

    try {
      await expect(
        runLLMCompletion(fakeClient, {
          messages: [{ role: 'user', content: 'test prompt' }],
          deadlineMs: 1000
        })
      ).rejects.toThrow(/LLM deadline 1000ms/);
    } finally {
      nowSpy.mockRestore();
    }
  });
});
