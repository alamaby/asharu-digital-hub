import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockProcessOneStudioImage = vi.fn();

vi.mock('@/lib/studio/worker', () => ({
  get processOneStudioImage() {
    return mockProcessOneStudioImage;
  }
}));

vi.mock('@/lib/content/cron-auth', () => ({
  isCronAuthorized: () => true
}));

const { POST } = await import('./route');

describe('/api/studio/process route tick behavior', () => {
  beforeEach(() => {
    mockProcessOneStudioImage.mockReset();
  });

  it('melanjutkan slot kedua saat slot pertama gagal (continue on error)', async () => {
    mockProcessOneStudioImage
      .mockResolvedValueOnce({ imageId: null, error: 'boom' })
      .mockResolvedValueOnce({ imageId: 'B' });

    const req = new Request('http://localhost/api/studio/process', { method: 'POST' });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({
      ok: true,
      processed: ['B'],
      count: 1,
      lastError: 'boom'
    });
    expect(mockProcessOneStudioImage).toHaveBeenCalledTimes(2);
  });

  it('langsung break saat slot pertama kosong tanpa error (queue kosong)', async () => {
    mockProcessOneStudioImage
      .mockResolvedValueOnce({ imageId: null })
      .mockResolvedValueOnce({ imageId: 'B' });

    const req = new Request('http://localhost/api/studio/process', { method: 'POST' });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({
      ok: true,
      processed: [],
      count: 0,
      lastError: null
    });
    expect(mockProcessOneStudioImage).toHaveBeenCalledTimes(1);
  });
});
