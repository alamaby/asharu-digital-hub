export const ANALYTICS_EVENT_NAMES = [
  'click_online_store',
  'click_social_media',
  'click_affiliate_product',
  'view_property',
  'click_property_contact',
  'change_language'
] as const;

export type AnalyticsEventName = (typeof ANALYTICS_EVENT_NAMES)[number];

/**
 * Allow-listed event parameters. Never send PII (names, emails, phone
 * numbers, message contents, full property addresses) to Google Analytics.
 */
export interface AnalyticsEventParams {
  item_id?: string;
  item_category?: string;
  platform?: string;
  locale?: string;
  link_position?: string;
}

export interface PageViewParams {
  page_location: string;
  page_title?: string;
}

/** Loose at the wire level; public helpers below stay strictly typed. */
type GtagFunction = (...args: unknown[]) => void;

declare global {
  interface Window {
    gtag?: GtagFunction;
    dataLayer?: unknown[];
  }
}

function isGtagAvailable(): boolean {
  return typeof window !== 'undefined' && typeof window.gtag === 'function';
}

/**
 * Sends a typed GA4 event. Returns false (and does nothing) when gtag is not
 * available — i.e. analytics is disabled or consent has not been granted.
 */
export function trackEvent(
  name: AnalyticsEventName,
  params: AnalyticsEventParams = {}
): boolean {
  if (!isGtagAvailable()) {
    return false;
  }
  window.gtag!('event', name, params);
  return true;
}

/** Standard GA4 page_view hit (used by PageViewTracker on client navigation). */
export function trackPageView(params: PageViewParams): boolean {
  if (!isGtagAvailable()) {
    return false;
  }
  window.gtag!('event', 'page_view', params);
  return true;
}
