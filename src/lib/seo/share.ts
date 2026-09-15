/**
 * Pure helpers untuk Share-to-social artikel.
 *
 * - Urutan tombol: WhatsApp pertama (pasar ID), lalu Threads, X,
 *   Facebook, Telegram, Salin tautan. Native Web Share (`navigator.share`)
 *   opsional dan selalu terakhir (progressive enhancement).
 * - URL yang dibagikan = canonical bersih + UTM per channel
 *   (`utm_source={channel}&utm_medium=share&utm_campaign=artikel`).
 *   Canonical di `<head>` (`alternates.canonical`, `og:url`) tetap bersih
 *   tanpa UTM agar tidak memecah sinyal SEO.
 */

export const SHARE_UTM_MEDIUM = 'share';
export const SHARE_UTM_CAMPAIGN = 'artikel';

export type ShareChannel =
  | 'whatsapp'
  | 'threads'
  | 'x'
  | 'facebook'
  | 'telegram'
  | 'copy'
  | 'native';

/** Urutan render tombol share (native ditangani terpisah di komponen). */
export const SHARE_CHANNEL_ORDER: Exclude<ShareChannel, 'native'>[] = [
  'whatsapp',
  'threads',
  'x',
  'facebook',
  'telegram',
  'copy'
];

/** Nama tampilan channel (brand, sama untuk id/en). */
export const SHARE_CHANNEL_LABELS: Record<ShareChannel, string> = {
  whatsapp: 'WhatsApp',
  threads: 'Threads',
  x: 'X',
  facebook: 'Facebook',
  telegram: 'Telegram',
  copy: 'copy',
  native: 'native'
};

/**
 * Tambah UTM share ke canonical absolut. Melempar bila URL tidak absolut —
 * caller wajib mengoper canonical (`${siteUrl}${localizedPathname(...)}`).
 */
export function withShareUtm(canonicalUrl: string, source: ShareChannel): string {
  const url = new URL(canonicalUrl);
  url.searchParams.set('utm_source', source);
  url.searchParams.set('utm_medium', SHARE_UTM_MEDIUM);
  url.searchParams.set('utm_campaign', SHARE_UTM_CAMPAIGN);
  return url.toString();
}

export interface ShareLink {
  channel: Exclude<ShareChannel, 'native'>;
  href: string;
}

/**
 * Intent URL per platform. Threads tidak punya param `url` terpisah
 * sehingga URL-utm digabung ke `text`.
 */
export function buildShareLinks(canonicalUrl: string, title: string): ShareLink[] {
  const textWithUrl = (source: ShareChannel) =>
    `${title} ${withShareUtm(canonicalUrl, source)}`;

  const hrefs: Record<Exclude<ShareChannel, 'native'>, string> = {
    whatsapp: `https://wa.me/?text=${encodeURIComponent(textWithUrl('whatsapp'))}`,
    threads: `https://www.threads.net/intent/post?text=${encodeURIComponent(textWithUrl('threads'))}`,
    x: `https://x.com/intent/tweet?text=${encodeURIComponent(title)}&url=${encodeURIComponent(withShareUtm(canonicalUrl, 'x'))}`,
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(withShareUtm(canonicalUrl, 'facebook'))}`,
    telegram: `https://t.me/share/url?url=${encodeURIComponent(withShareUtm(canonicalUrl, 'telegram'))}&text=${encodeURIComponent(title)}`,
    copy: withShareUtm(canonicalUrl, 'copy')
  };

  return SHARE_CHANNEL_ORDER.map((channel) => ({ channel, href: hrefs[channel] }));
}
