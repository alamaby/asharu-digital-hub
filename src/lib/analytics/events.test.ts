import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ANALYTICS_EVENT_NAMES, trackEvent, trackPageView } from './events';

describe('trackEvent', () => {
  const gtag = vi.fn();

  beforeEach(() => {
    window.gtag = gtag;
  });

  afterEach(() => {
    delete window.gtag;
    vi.clearAllMocks();
  });

  it('forwards typed events and params to gtag', () => {
    const result = trackEvent('click_affiliate_product', {
      item_id: 'product-01',
      item_category: 'electronics',
      link_position: 'home-featured'
    });

    expect(result).toBe(true);
    expect(gtag).toHaveBeenCalledWith('event', 'click_affiliate_product', {
      item_id: 'product-01',
      item_category: 'electronics',
      link_position: 'home-featured'
    });
  });

  it('accepts an empty params object', () => {
    expect(trackEvent('change_language')).toBe(true);
  });

  it('is a no-op without gtag (analytics disabled or consent missing)', () => {
    delete window.gtag;
    expect(trackEvent('view_property')).toBe(false);
  });

  it('exposes exactly the six documented event names', () => {
    expect([...ANALYTICS_EVENT_NAMES]).toEqual([
      'click_online_store',
      'click_social_media',
      'click_affiliate_product',
      'view_property',
      'click_property_contact',
      'change_language'
    ]);
  });
});

describe('trackPageView', () => {
  const gtag = vi.fn();

  beforeEach(() => {
    window.gtag = gtag;
  });

  afterEach(() => {
    delete window.gtag;
    vi.clearAllMocks();
  });

  it('sends page_location and optional title', () => {
    expect(trackPageView({ page_location: 'https://asharu.id/id/produk' })).toBe(true);
    expect(gtag).toHaveBeenCalledWith('event', 'page_view', {
      page_location: 'https://asharu.id/id/produk'
    });

    expect(
      trackPageView({ page_location: 'https://asharu.id/en', page_title: 'Home' })
    ).toBe(true);
    expect(gtag).toHaveBeenLastCalledWith('event', 'page_view', {
      page_location: 'https://asharu.id/en',
      page_title: 'Home'
    });
  });

  it('is a no-op without gtag', () => {
    delete window.gtag;
    expect(trackPageView({ page_location: 'https://asharu.id/' })).toBe(false);
    expect(gtag).not.toHaveBeenCalled();
  });
});
