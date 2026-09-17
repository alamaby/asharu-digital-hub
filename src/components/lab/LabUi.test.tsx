import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithMessages } from '@/test/utils';
import type { LabBatchWithRuns, LabOptions, LabRunRow } from '@/lib/lab/types';
import { DEFAULT_LAB_CONFIG } from '@/lib/lab/types';
import type { LabSummary } from '@/lib/lab/stats';
import { LabForm } from './LabForm';
import { LabCompareGrid } from './LabCompareGrid';
import { LabHistory } from './LabHistory';
import { LabStats } from './LabStats';
import { LabCardActions } from './LabCardActions';

vi.mock('@/lib/lab/actions', () => ({
  runChatLabBatch: vi.fn(async () => ({ ok: true, data: { batchId: 'batch-1' } })),
  listLabBatches: vi.fn(async () => ({ items: [], total: 0, page: 1, pageSize: 10, totalPages: 1 })),
  deleteLabBatch: vi.fn(async () => ({ ok: true, data: null })),
  getLabBatch: vi.fn(async () => null),
  getLabStats: vi.fn(async () => null)
}));

function pageOf(items: ReturnType<typeof batch>[], total = items.length) {
  return {
    items,
    total,
    page: 1,
    pageSize: 10,
    totalPages: Math.max(1, Math.ceil(total / 10))
  };
}

function options(): LabOptions {
  return {
    providers: [
      { id: 'p1', slug: 'naraya', display_name: 'Naraya' },
      { id: 'p2', slug: 'openrouter', display_name: 'OpenRouter' }
    ],
    models: [
      { id: 'm1', provider_id: 'p1', model_id: 'naraya/model-a', display_name: 'Model A' },
      { id: 'm2', provider_id: 'p2', model_id: 'openrouter/model-b', display_name: 'Model B' }
    ],
    config: DEFAULT_LAB_CONFIG
  };
}

function runRow(over: Partial<LabRunRow> & { id: string }): LabRunRow {
  return {
    batch_id: 'b1',
    user_id: 'u1',
    provider_id: 'p1',
    model_id: 'm1',
    provider_slug: 'naraya',
    model_slug: 'naraya/model-a',
    prompt_tokens: 10,
    completion_tokens: 20,
    total_tokens: 30,
    thought_tokens: null,
    latency_ms: 1000,
    tokens_per_sec: 20,
    ttft_ms: null,
    finish_reason: 'stop',
    is_fallback: false,
    response_truncated: false,
    http_status: 200,
    error: null,
    request_messages: [{ role: 'user', content: 'hai' }],
    response_text: 'Halo juga!',
    expires_at: '2026-10-17T00:00:00Z',
    created_at: '2026-09-17T10:00:00Z',
    ...over
  };
}

function batch(): LabBatchWithRuns {
  return {
    batch: {
      id: 'b1',
      user_id: 'u1',
      system_prompt: null,
      user_prompt: 'Jelaskan fotosintesis.',
      temperature: null,
      max_tokens: null,
      has_error: false,
      expires_at: '2026-10-17T00:00:00Z',
      created_at: '2026-09-17T10:00:00Z'
    },
    runs: [
      runRow({ id: 'r1' }),
      runRow({ id: 'r2', provider_id: 'p2', model_id: 'm2', provider_slug: 'openrouter', model_slug: 'openrouter/model-b', latency_ms: 2000, tokens_per_sec: 10 })
    ]
  };
}

function summary(): LabSummary {
  return {
    batches: 2,
    runs: 3,
    ok: 2,
    errors: 1,
    fallbacks: 1,
    truncated: 0,
    promptTotal: 25,
    completionTotal: 45,
    tokenTotal: 70,
    avgLatencyMs: 1500,
    avgTokensPerSec: 15,
    successPct: 66.7,
    ranks: { providers: [], models: [] },
    byRun: [
      { runId: 'r1', label: 'naraya / model-a', provider: 'naraya', model: 'naraya/model-a', prompt: 10, completion: 20, total: 30, latencyMs: 1000, tps: 20, ok: true, fallback: false, createdAt: '2026-09-17T10:00:00Z' },
      { runId: 'r2', label: 'openrouter / model-b', provider: 'openrouter', model: 'openrouter/model-b', prompt: 15, completion: 25, total: 40, latencyMs: 2000, tps: 12.5, ok: true, fallback: true, createdAt: '2026-09-17T11:00:00Z' }
    ]
  };
}

describe('LabStats', () => {
  it('empty state tanpa data', () => {
    renderWithMessages(<LabStats initial={null} locale="id" />);
    expect(screen.getByText(/Belum ada data/)).toBeDefined();
  });

  it('tab rentang selalu tampil', () => {
    renderWithMessages(<LabStats initial={null} locale="id" />);
    for (const label of ['Hari ini', '7 hari', '14 hari', '30 hari', 'Semua']) {
      expect(screen.getByText(label)).toBeDefined();
    }
  });

  it('render KPI + chart per-run', () => {
    renderWithMessages(<LabStats initial={summary()} locale="id" />);
    expect(screen.getByText('Statistik 30 hari')).toBeDefined();
    expect(screen.getByText('66.7%')).toBeDefined();
    expect(screen.getByText('Latensi per run (ms)')).toBeDefined();
    expect(screen.getByText('Kecepatan per run (tok/s)')).toBeDefined();
    expect(screen.getAllByText('Token per run (masuk + keluar)').length).toBeGreaterThan(0);
    expect(screen.getByText('Bar penuh = terbaik; bar redup = bukan pemenang')).toBeDefined();
  });

  it('tabel peringkat best-first + mahkota juara', () => {
    const s = summary();
    s.ranks = {
      providers: [
        { key: 'naraya', label: 'naraya', runs: 2, successPct: 100, avgLatencyMs: 1000, avgTps: 20, totalTokens: 70 },
        { key: 'openrouter', label: 'openrouter', runs: 2, successPct: 50, avgLatencyMs: 2000, avgTps: 12.5, totalTokens: 90 }
      ],
      models: [
        { key: 'naraya/model-a', label: 'naraya / model-a', runs: 2, successPct: 100, avgLatencyMs: 1000, avgTps: 20, totalTokens: 70 }
      ]
    };
    renderWithMessages(<LabStats initial={s} locale="id" />);
    expect(screen.getByText('Provider terbaik')).toBeDefined();
    expect(screen.getByText('Model terbaik')).toBeDefined();
    expect(screen.getAllByText('★ 1')).toHaveLength(2);
  });
});

describe('LabCompareGrid', () => {
  it('empty state sebelum submit', () => {
    renderWithMessages(<LabCompareGrid result={null} />);
    expect(screen.getByText(/Belum ada hasil/)).toBeDefined();
  });

  it('render side-by-side provider + metrik', () => {
    renderWithMessages(<LabCompareGrid result={batch()} />);
    expect(screen.getByText('Hasil komparasi')).toBeDefined();
    expect(screen.getByText('naraya / model-a')).toBeDefined();
    expect(screen.getByText('openrouter / model-b')).toBeDefined();
    expect(screen.getAllByText('Halo juga!')).toHaveLength(2);
  });

  it('kotak metrik terbaik di-highlight', () => {
    renderWithMessages(<LabCompareGrid result={batch()} />);
    // r1: latensi 1000 < 2000, tok/s 20 > 10 → menang keduanya (batch() default)
    expect(screen.getByTitle('Latensi terendah')).toBeDefined();
    expect(screen.getByTitle('Kecepatan tertinggi')).toBeDefined();
    expect(screen.getByText('Kotak hijau = terbaik per metrik')).toBeDefined();
  });

  it('run error tampil jujur', () => {
    const b = batch();
    b.runs = [runRow({ id: 're', error: 'Model pilihan gagal (strict)', response_text: null, http_status: null, latency_ms: null, tokens_per_sec: null })];
    renderWithMessages(<LabCompareGrid result={b} />);
    expect(screen.getByText(/tanpa fallback/)).toBeDefined();
  });
});

describe('LabForm', () => {
  it('render field prompt + 1 target + tambah target', async () => {
    const user = userEvent.setup();
    renderWithMessages(<LabForm options={options()} quota={{ used: 0, limit: 50, remaining: 50 }} />);
    expect(screen.getByLabelText(/Prompt/)).toBeDefined();
    expect(screen.getByText('Target model (1–3)')).toBeDefined();
    await user.click(screen.getByText('+ Tambah target'));
    expect(screen.getByText('Target 2 · Provider')).toBeDefined();
  });

  it('tombol disable bila prompt <10 karakter', () => {
    renderWithMessages(<LabForm options={options()} quota={{ used: 0, limit: 50, remaining: 50 }} />);
    expect((screen.getByText('Jalankan') as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('LabHistory', () => {
  it('render batch + filter + aksi', () => {
    renderWithMessages(
      <LabHistory initialPage={pageOf([batch()])} locale="id" timeZone="Asia/Jakarta" />
    );
    expect(screen.getByText('Riwayat Uji')).toBeDefined();
    expect(screen.getByText('Jelaskan fotosintesis.')).toBeDefined();
    expect(screen.getByText('Pakai ulang')).toBeDefined();
    expect(screen.getByText('Hapus')).toBeDefined();
  });

  it('ada link buka detail per batch', () => {
    renderWithMessages(
      <LabHistory initialPage={pageOf([batch()])} locale="id" timeZone="Asia/Jakarta" />
    );
    const link = screen.getByText('Buka detail').closest('a');
    expect(link?.getAttribute('href')).toContain('/lab/b1');
  });

  it('pagination: info halaman + tombol next', async () => {
    const user = userEvent.setup();
    renderWithMessages(
      <LabHistory initialPage={pageOf([batch()], 25)} locale="id" timeZone="Asia/Jakarta" />
    );
    expect(screen.getByText('Halaman 1 dari 3 · 25')).toBeDefined();
    const next = screen.getByText('Lanjut ›');
    expect((next as HTMLButtonElement).disabled).toBe(false);
    await user.click(next);
    expect(screen.getByText('Halaman 1 dari 1 · 0')).toBeDefined();
  });

  it('tombol prev/next disable di satu halaman', () => {
    renderWithMessages(
      <LabHistory initialPage={pageOf([batch()])} locale="id" timeZone="Asia/Jakarta" />
    );
    expect((screen.getByText('‹ Sblm') as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByText('Lanjut ›') as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('LabCardActions', () => {
  it('render tombol unduh + bagikan', () => {
    renderWithMessages(<LabCardActions batchId="b1" />);
    expect(screen.getByText('Unduh kartu (1080×1080)')).toBeDefined();
    expect(screen.getByText('Bagikan')).toBeDefined();
  });
});
