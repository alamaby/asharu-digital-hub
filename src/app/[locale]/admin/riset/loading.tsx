export default function Loading() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6" aria-busy="true" aria-live="polite">
      <div className="h-9 w-56 animate-pulse rounded-md bg-surface" />
      <div className="mt-2 h-4 w-80 animate-pulse rounded-md bg-surface" />
      <div className="mt-6 space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-16 animate-pulse rounded-xl border border-line bg-surface" />
        ))}
      </div>
    </div>
  );
}
