'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  AtSign,
  Check,
  Facebook,
  Link2,
  MessageCircle,
  Send,
  Share2,
  Twitter,
  type LucideIcon
} from 'lucide-react';
import { TrackedExternalLink } from '@/components/ui/TrackedExternalLink';
import { trackEvent } from '@/lib/analytics/events';
import { copyToClipboard } from '@/lib/utils/clipboard';
import {
  SHARE_CHANNEL_LABELS,
  buildShareLinks,
  withShareUtm,
  type ShareChannel
} from '@/lib/seo/share';

interface ShareButtonsProps {
  /** Canonical absolut tanpa UTM (`${siteUrl}${localizedPathname(...)}`). */
  canonicalUrl: string;
  title: string;
}

const CHANNEL_ICONS: Record<Exclude<ShareChannel, 'native'>, LucideIcon> = {
  whatsapp: MessageCircle,
  threads: AtSign,
  x: Twitter,
  facebook: Facebook,
  telegram: Send,
  copy: Link2
};

const LINK_CLASS =
  'inline-flex min-h-touch items-center gap-2 rounded-lg border border-line bg-surface px-4 text-sm font-semibold text-ink transition-colors hover:border-primary hover:text-primary';

/**
 * Tombol share bawah artikel: WA → Threads → X → Facebook → Telegram →
 * Salin tautan (+ native `navigator.share` bila didukung, selalu terakhir).
 * Page tetap RSC; hanya island ini yang client.
 */
export function ShareButtons({ canonicalUrl, title }: ShareButtonsProps) {
  const t = useTranslations('articles');
  const [copied, setCopied] = useState(false);
  const [nativeSupported, setNativeSupported] = useState(false);

  const links = useMemo(
    () => buildShareLinks(canonicalUrl, title),
    [canonicalUrl, title]
  );
  const copyHref =
    links.find((l) => l.channel === 'copy')?.href ??
    withShareUtm(canonicalUrl, 'copy');

  useEffect(() => {
    const nav = navigator as Navigator & {
      share?: (data: ShareData) => Promise<void>;
    };
    if (typeof nav.share === 'function') setNativeSupported(true);
  }, []);

  async function onCopy() {
    try {
      await copyToClipboard(copyHref);
    } catch {
      // Semua jalur salin gagal (di luar https/Device lama) — jangan
      // tampilkan status "disalin" yang menyesatkan; user masih bisa salin
      // manual dari address bar.
      return;
    }
    trackEvent('click_social_media', {
      platform: 'copy',
      link_position: 'artikel-share'
    });
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  async function onNativeShare() {
    const nav = navigator as Navigator & {
      share: (data: ShareData) => Promise<void>;
    };
    try {
      await nav.share({
        title,
        text: title,
        url: withShareUtm(canonicalUrl, 'native')
      });
      trackEvent('click_social_media', {
        platform: 'native',
        link_position: 'artikel-share'
      });
    } catch {
      // AbortError saat user menutup sheet — bukan error aplikasi.
    }
  }

  return (
    <section aria-labelledby="share-heading" className="mt-10 border-t border-line pt-6">
      <h2 id="share-heading" className="text-base font-semibold text-ink">
        {t('shareHeading')}
      </h2>
      <ul className="mt-4 flex flex-wrap gap-2">
        {links
          .filter((l) => l.channel !== 'copy')
          .map((link) => {
            const Icon: LucideIcon = CHANNEL_ICONS[link.channel];
            const label = SHARE_CHANNEL_LABELS[link.channel];
            return (
              <li key={link.channel}>
                <TrackedExternalLink
                  href={link.href}
                  event="click_social_media"
                  params={{ platform: link.channel, link_position: 'artikel-share' }}
                  aria-label={t('shareVia', { channel: label })}
                  className={LINK_CLASS}
                >
                  <Icon className="size-4" aria-hidden />
                  {label}
                </TrackedExternalLink>
              </li>
            );
          })}
        <li>
          <button
            type="button"
            onClick={onCopy}
            aria-live="polite"
            className={LINK_CLASS}
          >
            {copied ? (
              <Check className="size-4" aria-hidden />
            ) : (
              <Link2 className="size-4" aria-hidden />
            )}
            {copied ? t('shareCopied') : t('shareCopy')}
          </button>
        </li>
        {nativeSupported ? (
          <li>
            <button
              type="button"
              onClick={onNativeShare}
              className={LINK_CLASS}
            >
              <Share2 className="size-4" aria-hidden />
              {t('shareNative')}
            </button>
          </li>
        ) : null}
      </ul>
    </section>
  );
}
