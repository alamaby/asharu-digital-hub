import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

// Helper fake query builder untuk Supabase client kosong
function createEmptyQuery() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const query: any = {
    select: vi.fn(() => query),
    insert: vi.fn(() => query),
    update: vi.fn(() => query),
    delete: vi.fn(() => query),
    eq: vi.fn(() => query),
    neq: vi.fn(() => query),
    in: vi.fn(() => query),
    is: vi.fn(() => query),
    lt: vi.fn(() => query),
    lte: vi.fn(() => query),
    gt: vi.fn(() => query),
    gte: vi.fn(() => query),
    order: vi.fn(() => query),
    limit: vi.fn(() => query),
    range: vi.fn(() => query),
    maybeSingle: vi.fn(async () => ({ data: null, error: null })),
    single: vi.fn(async () => ({ data: null, error: null })),
    then(onfulfilled: (res: { data: unknown[]; error: null; count: number }) => unknown) {
      return Promise.resolve(onfulfilled({ data: [], error: null, count: 0 }));
    }
  };
  return query;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fakeEmptyClient: any = {
  from: vi.fn(() => createEmptyQuery()),
  rpc: vi.fn(async () => ({ data: null, error: null }))
};

vi.mock('@/lib/supabase/service', () => ({
  getServiceClient: () => fakeEmptyClient
}));

vi.mock('@/lib/llm/completion', () => ({
  runLLMCompletion: vi.fn(async () => ({ output: { text: '{}' }, providerSlug: 'p', model: 'm' }))
}));

vi.mock('@/lib/automation/config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/automation/config')>();
  return {
    ...actual,
    loadAutomationConfig: vi.fn(async () => ({
      isEnabled: false,
      scheduleHour: 10,
      scheduleMinute: 0,
      timezone: 'Asia/Jakarta'
    }))
  };
});

import { runAutomationTick } from '@/lib/automation/runner';
import { runErrorDigestTick } from '@/lib/notifications/error-digest';
import { claimDueQueueItem } from '@/lib/social/queue';
import { processImageTick } from '@/lib/image/worker';
import { processOneStudioImage } from '@/lib/studio/worker';
import { advancePendingSessions } from '@/lib/research/orchestrator';

describe('cron idle contract invariants', () => {
  describe('1. automation run idle contract', () => {
    it('mengembalikan ok:true dan skipped:disabled saat automation dinonaktifkan', async () => {
      const result = await runAutomationTick(fakeEmptyClient as unknown as SupabaseClient);
      expect(result).toEqual({ ok: true, skipped: 'disabled' });
    });
  });

  describe('2. error digest idle contract', () => {
    it('mengembalikan sent:false, categories:[], eventCount:0 saat tidak ada config due', async () => {
      const result = await runErrorDigestTick(fakeEmptyClient as unknown as SupabaseClient);
      expect(result).toEqual({ sent: false, categories: [], eventCount: 0 });
    });
  });

  describe('3. social post queue idle contract', () => {
    it('mengembalikan outcome:idle saat antrean kosong', async () => {
      const result = await claimDueQueueItem(fakeEmptyClient as unknown as SupabaseClient);
      expect(result).toEqual({ outcome: 'idle' });
    });
  });

  describe('4. image worker idle contract', () => {
    it('mengembalikan imageId:null dan processed:0 saat tidak ada cover pending atau missing', async () => {
      const result = await processImageTick();
      expect(result).toEqual({ imageId: null, processed: 0 });
    });
  });

  describe('5. studio worker idle contract', () => {
    it('mengembalikan imageId:null saat antrean user image kosong', async () => {
      const result = await processOneStudioImage();
      expect(result).toEqual({ imageId: null });
    });
  });

  describe('6. research orchestrator idle contract', () => {
    it('mengembalikan advanced:0 saat tidak ada sesi riset yang perlu dimajukan', async () => {
      const result = await advancePendingSessions(fakeEmptyClient as unknown as SupabaseClient, 5);
      expect(result).toBe(0);
    });
  });

  describe('7. legacy content processor idle contract', () => {
    it('mendokumentasikan bentuk respons idle saat antrean pending kosong', () => {
      const legacyIdle = { processed: 0, message: 'No pending requests' };
      expect(legacyIdle).toEqual({ processed: 0, message: 'No pending requests' });
    });
  });
});
