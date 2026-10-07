import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockRpc = vi.fn();

vi.mock('./service', () => ({
  getServiceClient: () => ({ rpc: (...args: unknown[]) => mockRpc(...args) })
}));

import {
  DEFAULT_FAILURE_THRESHOLD,
  incrementFailureCounter,
  incrementUsageCounter
} from './counters';

beforeEach(() => {
  mockRpc.mockReset();
});

describe('incrementUsageCounter', () => {
  it('memanggil RPC atomik dengan tabel + id', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });
    await incrementUsageCounter('llm_provider_keys', 'key-1');

    expect(mockRpc).toHaveBeenCalledWith('increment_usage_counter', {
      p_table: 'llm_provider_keys',
      p_id: 'key-1'
    });
  });

  it('melempar saat RPC gagal (pemanggil LLM pool mengharapkan error)', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'permission denied' } });
    await expect(incrementUsageCounter('llm_models', 'model-1')).rejects.toThrow(
      /incrementUsageCounter\(llm_models\): permission denied/
    );
  });
});

describe('incrementFailureCounter', () => {
  it('mengembalikan failure_count baru + meneruskan threshold default', async () => {
    mockRpc.mockResolvedValue({ data: 6, error: null });
    await expect(incrementFailureCounter('image_models', 'model-9')).resolves.toBe(6);

    expect(mockRpc).toHaveBeenCalledWith('increment_failure_counter', {
      p_table: 'image_models',
      p_id: 'model-9',
      p_threshold: DEFAULT_FAILURE_THRESHOLD
    });
  });

  it('meneruskan threshold kustom', async () => {
    mockRpc.mockResolvedValue({ data: 2, error: null });
    await incrementFailureCounter('image_provider_keys', 'key-9', 1);
    expect(mockRpc).toHaveBeenCalledWith('increment_failure_counter', {
      p_table: 'image_provider_keys',
      p_id: 'key-9',
      p_threshold: 1
    });
  });

  it('melempar saat RPC gagal', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'boom' } });
    await expect(incrementFailureCounter('llm_models', 'm')).rejects.toThrow(
      /incrementFailureCounter\(llm_models\): boom/
    );
  });

  it('RPC tanpa angka → 0 + catat error (tidak menonaktifkan model karena salah baca)', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockRpc.mockResolvedValue({ data: null, error: null });

    await expect(incrementFailureCounter('llm_models', 'm')).resolves.toBe(0);
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('tidak mengembalikan angka'));
    errorSpy.mockRestore();
  });
});
