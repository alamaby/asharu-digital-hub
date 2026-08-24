import { Inbox } from 'lucide-react';

interface EmptyStateProps {
  title: string;
  description: string;
}

export function EmptyState({ title, description }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-line bg-surface px-6 py-12 text-center">
      <Inbox className="size-8 text-ink-muted" aria-hidden />
      <p className="text-base font-semibold text-ink">{title}</p>
      <p className="max-w-md text-sm text-ink-muted">{description}</p>
    </div>
  );
}
