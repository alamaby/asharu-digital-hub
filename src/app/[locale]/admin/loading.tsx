export default function Loading() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6" aria-busy="true" aria-live="polite">
      <div className="h-9 w-48 animate-pulse rounded-md bg-surface" />
      <div className="mt-2 h-4 w-72 animate-pulse rounded-md bg-surface" />
      <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="h-24 animate-pulse rounded-xl border border-line bg-surface" />
        <div className="h-24 animate-pulse rounded-xl border border-line bg-surface" />
      </div>
      <div className="mt-6 h-32 animate-pulse rounded-xl border border-line bg-surface" />
      <div className="mt-6 h-48 animate-pulse rounded-xl border border-line bg-surface" />
    </div>
  );
}
