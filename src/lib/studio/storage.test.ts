import { describe, expect, it, vi, beforeEach } from 'vitest';

const { uploadMock } = vi.hoisted(() => ({ uploadMock: vi.fn() }));

vi.mock('@/lib/supabase/service', () => ({
  getServiceClient: () => ({
    storage: {
      from: () => ({
        upload: uploadMock,
        getPublicUrl: (path: string) => ({ data: { publicUrl: `https://cdn.test/${path}` } })
      })
    }
  })
}));

import {
  StudioStorageError,
  describeStorageError,
  isTransientStorageError,
  uploadUserImageWithRetry
} from './storage';

/** Error Storage tiruan berbentuk objek { message, status, statusCode, error }. */
function storageErr(over: Record<string, unknown> = {}) {
  return { message: 'none', status: 520, statusCode: 'InternalError', error: 'none', ...over };
}

describe('isTransientStorageError', () => {
  it('5xx / 408 / 429 transient', () => {
    expect(isTransientStorageError(new StudioStorageError('x', { status: 520 }))).toBe(true);
    expect(isTransientStorageError(new StudioStorageError('x', { status: 500 }))).toBe(true);
    expect(isTransientStorageError(new StudioStorageError('x', { status: 408 }))).toBe(true);
    expect(isTransientStorageError(new StudioStorageError('x', { status: 429 }))).toBe(true);
  });

  it('4xx permanen bukan transient', () => {
    expect(isTransientStorageError(new StudioStorageError('x', { status: 400 }))).toBe(false);
    expect(isTransientStorageError(new StudioStorageError('x', { status: 403 }))).toBe(false);
    expect(isTransientStorageError(new StudioStorageError('x', { status: 409 }))).toBe(false);
  });

  it('error non-Storage / tanpa status bukan transient', () => {
    expect(isTransientStorageError(new Error('boom'))).toBe(false);
    expect(isTransientStorageError(null)).toBe(false);
  });
});

describe('describeStorageError', () => {
  it('menyertakan HTTP status saat pesan asli <none> (kasus 520 c19c8d2f)', () => {
    const e = new StudioStorageError('studio storage upload failed: upload gagal', {
      status: 520,
      statusCode: 'InternalError',
      storageError: 'none'
    });
    const out = describeStorageError(e);
    expect(out).toContain('studio storage upload failed');
    expect(out).toContain('HTTP 520');
    expect(out).toContain('code=InternalError');
    // storageError 'none' tidak ikut ditampilkan.
    expect(out).not.toContain('storage=none');
  });

  it('memakai pesan Error biasa apa adanya', () => {
    expect(describeStorageError(new Error('koneksi ditolak'))).toBe('koneksi ditolak');
  });
});

describe('uploadUserImageWithRetry', () => {
  beforeEach(() => {
    uploadMock.mockReset();
  });

  it('sukses pada percobaan pertama tanpa retry', async () => {
    uploadMock.mockResolvedValueOnce({ error: null });
    const res = await uploadUserImageWithRetry('u1', 'img-1', new Uint8Array([1]), 'image/png', [0, 0]);
    expect(res.storagePath).toBe('u1/img-1.png');
    expect(uploadMock).toHaveBeenCalledTimes(1);
  });

  it('retry 520 transient lalu sukses (kasus c19c8d2f)', async () => {
    uploadMock
      .mockResolvedValueOnce({ error: storageErr() })
      .mockResolvedValueOnce({ error: null });
    const res = await uploadUserImageWithRetry('u1', 'img-1', new Uint8Array([1]), 'image/png', [0, 0]);
    expect(res.storagePath).toBe('u1/img-1.png');
    expect(uploadMock).toHaveBeenCalledTimes(2);
  });

  it('retry dua kali lalu sukses pada percobaan ketiga', async () => {
    uploadMock
      .mockResolvedValueOnce({ error: storageErr() })
      .mockResolvedValueOnce({ error: storageErr({ status: 503 }) })
      .mockResolvedValueOnce({ error: null });
    const res = await uploadUserImageWithRetry('u1', 'img-1', new Uint8Array([1]), 'image/png', [0, 0]);
    expect(res.storagePath).toBe('u1/img-1.png');
    expect(uploadMock).toHaveBeenCalledTimes(3);
  });

  it('menyerah setelah semua retry transient habis', async () => {
    uploadMock.mockResolvedValue({ error: storageErr() });
    await expect(
      uploadUserImageWithRetry('u1', 'img-1', new Uint8Array([1]), 'image/png', [0, 0])
    ).rejects.toBeInstanceOf(StudioStorageError);
    expect(uploadMock).toHaveBeenCalledTimes(3);
  });

  it('error permanen 400 tidak di-retry', async () => {
    uploadMock.mockResolvedValue({ error: storageErr({ status: 400, statusCode: 'InvalidRequest', error: 'InvalidRequest' }) });
    await expect(
      uploadUserImageWithRetry('u1', 'img-1', new Uint8Array([1]), 'image/png', [0, 0])
    ).rejects.toBeInstanceOf(StudioStorageError);
    expect(uploadMock).toHaveBeenCalledTimes(1);
  });
});
