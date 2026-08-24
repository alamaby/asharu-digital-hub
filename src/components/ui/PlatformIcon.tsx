import {
  Clapperboard,
  Facebook,
  Globe,
  Instagram,
  Linkedin,
  MessageCircle,
  Music2,
  ShoppingBag,
  Store,
  Youtube,
  type LucideIcon
} from 'lucide-react';
import type { ShopPlatform, SocialPlatform } from '@/data/schemas';

const ICONS = {
  shopee: ShoppingBag,
  tokopedia: Store,
  'tiktok-shop': Clapperboard,
  'web-store': Globe,
  instagram: Instagram,
  tiktok: Music2,
  youtube: Youtube,
  facebook: Facebook,
  linkedin: Linkedin,
  whatsapp: MessageCircle
} as const satisfies Record<ShopPlatform | SocialPlatform, LucideIcon>;

interface PlatformIconProps {
  platform: ShopPlatform | SocialPlatform;
  className?: string;
}

/** Decorative brand-adjacent icon (lucide has no official brand marks). */
export function PlatformIcon({ platform, className }: PlatformIconProps) {
  const Icon = ICONS[platform];
  return <Icon className={className} aria-hidden />;
}
