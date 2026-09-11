import type { ReactNode } from 'react';
import { cn } from '@/lib/utils/cn';

type AdminBadgeColor = 'primary' | 'success' | 'error' | 'warning' | 'info' | 'neutral';

interface AdminBadgeProps {
  color?: AdminBadgeColor;
  children: ReactNode;
}

const COLOR_STYLES: Record<AdminBadgeColor, string> = {
  primary: 'bg-brand-50 text-brand-500 dark:bg-brand-500/15 dark:text-brand-400',
  success: 'bg-success-50 text-success-600 dark:bg-success-500/15 dark:text-success-500',
  error: 'bg-error-50 text-error-600 dark:bg-error-500/15 dark:text-error-500',
  warning: 'bg-warning-50 text-warning-600 dark:bg-warning-500/15 dark:text-orange-400',
  info: 'bg-blue-light-50 text-blue-light-600 dark:bg-blue-light-500/15 dark:text-blue-light-400',
  neutral: 'bg-gray-100 text-gray-700 dark:bg-white/5 dark:text-white/80'
};

/** Badge status standar admin (adaptasi TailAdmin Badge). */
export function AdminBadge({ color = 'primary', children }: AdminBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center justify-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium',
        COLOR_STYLES[color]
      )}
    >
      {children}
    </span>
  );
}
