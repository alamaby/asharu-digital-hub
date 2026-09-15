import { describe, expect, it } from 'vitest';
import { buildShareLinks, SHARE_CHANNEL_ORDER, withShareUtm } from './share';

const CANONICAL =
  'https://asharu.id/id/artikel/kipas-genggam-bandung-solusi-panas';
const TITLE = 'Panas Bandung Bikin Gerah? Kipas Genggam Solusi Wajib!';

describe('withShareUtm', () => {
  it('menambah utm per channel tanpa mengubah path canonical', () => {
    const out = withShareUtm(CANONICAL, 'whatsapp');
    const url = new URL(out);
    expect(url.origin + url.pathname).toBe(CANONICAL);
    expect(url.searchParams.get('utm_source')).toBe('whatsapp');
    expect(url.searchParams.get('utm_medium')).toBe('share');
    expect(url.searchParams.get('utm_campaign')).toBe('artikel');
  });

  it('menolak URL relatif agar canonical selalu absolut', () => {
    expect(() => withShareUtm('/id/artikel/x', 'x')).toThrow();
  });
});

describe('buildShareLinks', () => {
  it('urutan WA pertama, Threads kedua, salin terakhir', () => {
    expect(SHARE_CHANNEL_ORDER[0]).toBe('whatsapp');
    expect(SHARE_CHANNEL_ORDER[1]).toBe('threads');
    expect(SHARE_CHANNEL_ORDER.at(-1)).toBe('copy');
    const links = buildShareLinks(CANONICAL, TITLE);
    expect(links.map((l) => l.channel)).toEqual(SHARE_CHANNEL_ORDER);
  });

  it('setiap href memuat utm_source channel-nya', () => {
    for (const link of buildShareLinks(CANONICAL, TITLE)) {
      const encoded = encodeURIComponent(`utm_source=${link.channel}`);
      const raw = `utm_source=${link.channel}`;
      expect(link.href.includes(encoded) || link.href.includes(raw)).toBe(true);
    }
  });

  it('threads menggabung URL-utm ke param text', () => {
    const threads = buildShareLinks(CANONICAL, TITLE).find(
      (l) => l.channel === 'threads'
    )!;
    expect(threads.href.startsWith('https://www.threads.net/intent/post?text=')).toBe(
      true
    );
    const text = new URL(threads.href).searchParams.get('text') ?? '';
    expect(text).toContain(TITLE);
    expect(text).toContain('utm_source=threads');
    expect(text).toContain(CANONICAL);
  });

  it('facebook hanya membawa param u (preview dari OG)', () => {
    const fb = buildShareLinks(CANONICAL, TITLE).find(
      (l) => l.channel === 'facebook'
    )!;
    const url = new URL(fb.href);
    expect(url.hostname).toBe('www.facebook.com');
    expect(url.searchParams.get('u')).toContain('utm_source=facebook');
  });

  it('x memakai x.com dan telegram memakai t.me', () => {
    const byChannel = new Map(
      buildShareLinks(CANONICAL, TITLE).map((l) => [l.channel, l.href])
    );
    expect(byChannel.get('x')!.startsWith('https://x.com/intent/tweet?')).toBe(
      true
    );
    expect(byChannel.get('telegram')!.startsWith('https://t.me/share/url?')).toBe(
      true
    );
    expect(new URL(byChannel.get('x')!).searchParams.get('url')).toContain(
      'utm_source=x'
    );
  });
});
