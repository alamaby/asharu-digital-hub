export default function Loading() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6" aria-busy="true" aria-live="polite">
      <div className="h-9 w-56 animate-pulse rounded-md bg-surface" />
      <div className="mt-2 h-4 w-80 animate-pulse rounded-md bg-surface" />
      <div className="mt-6 h-24 animate-pulse rounded-xl border border-line bg-surface" />
      <div className="mt-4 h-72 animate-pulse rounded-xl border border-line bg-surface" />
      <div className="mt-3 space-y-3 md:hidden">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-xl border border-line bg-surface" />
        ))}
      </div>
    </div>
  );
}
