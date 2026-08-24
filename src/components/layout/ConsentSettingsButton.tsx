'use client';

import type { ReactNode } from 'react';
import { CONSENT_OPEN_EVENT } from '@/lib/analytics/consent';

interface ConsentSettingsButtonProps {
  className?: string;
  children: ReactNode;
}

/** Reopens the consent banner via a custom event (no global state needed). */
export function ConsentSettingsButton({ className, children }: ConsentSettingsButtonProps) {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event(CONSENT_OPEN_EVENT))}
      className={className}
    >
      {children}
    </button>
  );
}
