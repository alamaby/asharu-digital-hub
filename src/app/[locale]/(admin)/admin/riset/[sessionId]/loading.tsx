export default function Loading() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6" aria-busy="true" aria-live="polite">
      <div className="h-4 w-32 animate-pulse rounded-md bg-surface" />
      <div className="mt-4 h-8 w-72 animate-pulse rounded-md bg-surface" />
      <div className="mt-2 h-4 w-96 animate-pulse rounded-md bg-surface" />
      <div className="mt-6 h-32 animate-pulse rounded-xl border border-line bg-surface" />
      <div className="mt-4 space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-14 animate-pulse rounded-xl border border-line bg-surface" />
        ))}
      </div>
    </div>
  );
}
