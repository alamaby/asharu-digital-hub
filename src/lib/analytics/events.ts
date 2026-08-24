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

type GtagFunction = (
  command: 'event',
  name: AnalyticsEventName,
  params: AnalyticsEventParams
) => void;

declare global {
  interface Window {
    gtag?: GtagFunction;
    dataLayer?: unknown[];
  }
}

/**
 * Sends a typed GA4 event. Returns false (and does nothing) when gtag is not
 * available — i.e. analytics is disabled or consent has not been granted.
 */
export function trackEvent(
  name: AnalyticsEventName,
  params: AnalyticsEventParams = {}
): boolean {
  if (typeof window === 'undefined' || typeof window.gtag !== 'function') {
    return false;
  }
  window.gtag('event', name, params);
  return true;
}
