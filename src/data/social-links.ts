// Placeholder data — Replace with verified production data before launch.
import type { SocialLink, SocialPlatform } from './schemas';

/**
 * Non-WhatsApp social channels. The WhatsApp link is env-driven
 * (NEXT_PUBLIC_WHATSAPP_URL) and only included when configured — it must not
 * be hard-coded while no verified number exists.
 */
const baseSocialLinks: SocialLink[] = [
  {
    id: 'instagram',
    platform: 'instagram',
    name: { id: 'Instagram', en: 'Instagram' },
    handle: '@asharu',
    url: 'https://www.instagram.com/asharu'
  },
  {
    id: 'tiktok',
    platform: 'tiktok',
    name: { id: 'TikTok', en: 'TikTok' },
    handle: '@asharu',
    url: 'https://www.tiktok.com/@asharu'
  },
  {
    id: 'youtube',
    platform: 'youtube',
    name: { id: 'YouTube', en: 'YouTube' },
    handle: '@asharu',
    url: 'https://www.youtube.com/@asharu'
  },
  {
    id: 'facebook',
    platform: 'facebook',
    name: { id: 'Facebook', en: 'Facebook' },
    handle: 'asharu',
    url: 'https://www.facebook.com/asharu'
  },
  {
    id: 'linkedin',
    platform: 'linkedin',
    name: { id: 'LinkedIn', en: 'LinkedIn' },
    handle: 'asharu',
    url: 'https://www.linkedin.com/company/asharu'
  }
];

export function getSocialLinks(whatsappUrl?: string): SocialLink[] {
  const links = [...baseSocialLinks];
  if (whatsappUrl) {
    links.push({
      id: 'whatsapp',
      platform: 'whatsapp',
      name: { id: 'WhatsApp', en: 'WhatsApp' },
      handle: 'asharu',
      url: whatsappUrl
    });
  }
  return links;
}

/** Sorted, stable order for rendering. */
export const socialDisplayOrder: SocialPlatform[] = [
  'instagram',
  'tiktok',
  'youtube',
  'facebook',
  'linkedin',
  'whatsapp'
];
