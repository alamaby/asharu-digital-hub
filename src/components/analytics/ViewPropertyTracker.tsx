'use client';

import { useEffect, useRef } from 'react';
import { trackEvent } from '@/lib/analytics/events';

/**
 * Fires `view_property` once per mounted detail page. Server components
 * cannot send events, so this tiny client island bridges the gap.
 */
export function ViewPropertyTracker({ itemId }: { itemId: string }) {
  const firedRef = useRef(false);

  useEffect(() => {
    if (firedRef.current) return;
    firedRef.current = true;
    trackEvent('view_property', {
      item_id: itemId,
      link_position: 'property-detail'
    });
  }, [itemId]);

  return null;
}
