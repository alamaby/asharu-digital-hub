import { beforeEach, describe, expect, it, vi } from 'vitest';
import { uploadAffiliateImage } from './storage-uploader.mjs';

const mocks = vi.hoisted(() => ({
  getBuffer: vi.fn(),
  sharp: vi.fn()
}));

vi.mock('sharp', () => ({ default: mocks.sharp }));
vi.mock('./http.mjs', () => ({ getBuffer: mocks.getBuffer }));

function makeClient({ exists, uploadError = null, publicUrl = 'https://cdn.example/image.webp' }) {
  const upload = vi.fn().mockResolvedValue({ error: uploadError });
  const bucket = {
    exists: vi.fn().mockResolvedValue(exists),
    upload,
    getPublicUrl: vi.fn().mockReturnValue({ data: { publicUrl } })
  };

  return {
    client: { storage: { from: vi.fn(() => bucket) } },
    upload
  };
}

beforeEach(() => {
  mocks.getBuffer.mockReset().mockResolvedValue(Buffer.from('raw-image'));
  mocks.sharp.mockReset().mockImplementation(() => {
    const pipeline = {
      rotate: vi.fn(),
      resize: vi.fn(),
      webp: vi.fn(),
      toBuffer: vi.fn().mockResolvedValue(Buffer.from('webp-image'))
    };
    pipeline.rotate.mockReturnValue(pipeline);
    pipeline.resize.mockReturnValue(pipeline);
    pipeline.webp.mockReturnValue(pipeline);
    return pipeline;
  });
});

describe('uploadAffiliateImage', () => {
  it('uploads when exists reports a missing object with an error', async () => {
    const { client, upload } = makeClient({
      exists: { data: false, error: { message: 'Bad Request' } }
    });

    await expect(uploadAffiliateImage('https://cdn.example/source.jpg', '42', { supabase: client })).resolves.toMatchObject({
      storagePath: expect.stringMatching(/^42-[0-9a-f]{12}\.webp$/),
      publicUrl: 'https://cdn.example/image.webp'
    });
    expect(upload).toHaveBeenCalledOnce();
  });

  it('skips upload when the object already exists', async () => {
    const { client, upload } = makeClient({ exists: { data: true, error: null } });

    await uploadAffiliateImage('https://cdn.example/source.jpg', '42', { supabase: client });

    expect(upload).not.toHaveBeenCalled();
  });

  it('propagates upload errors', async () => {
    const { client } = makeClient({ exists: { data: false, error: null }, uploadError: { message: 'permission denied' } });

    await expect(uploadAffiliateImage('https://cdn.example/source.jpg', '42', { supabase: client })).rejects.toThrow(
      'storage upload failed: permission denied'
    );
  });

  it('fails when a public URL cannot be built', async () => {
    const { client } = makeClient({ exists: { data: true, error: null }, publicUrl: '' });

    await expect(uploadAffiliateImage('https://cdn.example/source.jpg', '42', { supabase: client })).rejects.toThrow(
      'storage getPublicUrl returned empty'
    );
  });
});
