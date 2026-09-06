import { describe, expect, it, vi } from 'vitest';
import { createImageContainer, publishSinglePost, publishThreadChain } from './threads';

function mockFetch(scenarios: { containerId: string; mediaId: string }[]) {
  let call = 0;
  return vi.fn(async () => {
    const step = scenarios[Math.floor(call / 2)]!;
    call += 1;
    const isContainer = call % 2 === 1;
    return {
      ok: true,
      json: async () => ({ id: isContainer ? step.containerId : step.mediaId })
    } as Response;
  });
}

describe('publishThreadChain', () => {
  it('publishes opener then replies with reply_to_id chain', async () => {
    const fetchImpl = mockFetch([
      { containerId: 'c0', mediaId: 'm0' },
      { containerId: 'c1', mediaId: 'm1' },
      { containerId: 'c2', mediaId: 'm2' }
    ]);
    const posted: number[] = [];
    const results = await publishThreadChain(fetchImpl as unknown as typeof fetch, {
      threadsUserId: '123',
      token: 'tok',
      texts: ['opener', 'reply 1', 'reply 2'],
      onPost: (index) => {
        posted.push(index);
      }
    });
    expect(results.map((r) => r.mediaId)).toEqual(['m0', 'm1', 'm2']);
    expect(posted).toEqual([0, 1, 2]);
    // container, publish × 3
    expect(fetchImpl).toHaveBeenCalledTimes(6);
    // reply 1 membawa reply_to_id = m0
    const calls = fetchImpl.mock.calls as unknown[][];
    const secondContainerInit = calls[2]?.[1] as { body: string };
    const secondContainerBody = JSON.parse(secondContainerInit.body) as { reply_to_id?: string };
    expect(secondContainerBody.reply_to_id).toBe('m0');
  });

  it('resumes from startIndex for retry', async () => {
    const fetchImpl = mockFetch([{ containerId: 'c1', mediaId: 'm1' }]);
    const results = await publishThreadChain(fetchImpl as unknown as typeof fetch, {
      threadsUserId: '123',
      token: 'tok',
      texts: ['opener', 'reply 1'],
      startIndex: 1,
      parentMediaId: 'm0'
    });
    expect(results).toHaveLength(1);
    const calls = fetchImpl.mock.calls as unknown[][];
    const init = calls[0]?.[1] as { body: string };
    const body = JSON.parse(init.body) as { reply_to_id?: string };
    expect(body.reply_to_id).toBe('m0');
  });
});

describe('publishSinglePost image attachment', () => {
  it('sends IMAGE container with image_url + text for opener', async () => {
    const fetchImpl = mockFetch([{ containerId: 'c0', mediaId: 'm0' }]);
    const result = await publishSinglePost(fetchImpl as unknown as typeof fetch, {
      threadsUserId: '123',
      token: 'tok',
      text: 'opener',
      imageUrl: 'https://cdn.test/cover.png'
    });
    expect(result.mediaId).toBe('m0');
    const calls = fetchImpl.mock.calls as unknown[][];
    const containerBody = JSON.parse((calls[0]?.[1] as { body: string }).body) as {
      media_type?: string;
      image_url?: string;
      text?: string;
    };
    expect(containerBody.media_type).toBe('IMAGE');
    expect(containerBody.image_url).toBe('https://cdn.test/cover.png');
    expect(containerBody.text).toBe('opener');
  });

  it('falls back to TEXT when IMAGE container fails', async () => {
    let call = 0;
    const fetchImpl = vi.fn(async () => {
      call += 1;
      if (call === 1) {
        return { ok: false, status: 400, json: async () => ({ error: { message: 'bad image' } }) } as Response;
      }
      return { ok: true, json: async () => ({ id: call === 2 ? 'c0' : 'm0' }) } as Response;
    });
    const result = await publishSinglePost(fetchImpl as unknown as typeof fetch, {
      threadsUserId: '123',
      token: 'tok',
      text: 'opener',
      imageUrl: 'https://cdn.test/cover.png'
    });
    expect(result.mediaId).toBe('m0');
    const calls = fetchImpl.mock.calls as unknown[][];
    const retryBody = JSON.parse((calls[1]?.[1] as { body: string }).body) as { media_type?: string };
    expect(retryBody.media_type).toBe('TEXT');
  });

  it('createImageContainer posts media_type IMAGE', async () => {
    const fetchImpl = mockFetch([{ containerId: 'ci', mediaId: 'm' }]);
    const id = await createImageContainer(fetchImpl as unknown as typeof fetch, {
      threadsUserId: '123',
      token: 'tok',
      imageUrl: 'https://cdn.test/a.png',
      text: 'hi'
    });
    expect(id).toBe('ci');
  });
});
