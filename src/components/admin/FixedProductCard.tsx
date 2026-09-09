interface FixedProduct {
  id: string;
  friendly_code: string;
  name_id: string;
  image?: string | null;
  category?: string | null;
  merchant?: string | null;
  url?: string | null;
}

/** Card display-only produk tetap mekanisme 2 (tanpa aksi Ganti/Hapus). */
export function FixedProductCard({ title, products }: { title: string; products: FixedProduct[] }) {
  if (products.length === 0) return null;
  return (
    <section aria-label={title} className="mt-3 rounded-xl border border-line bg-surface p-4 shadow-card">
      <h2 className="text-sm font-semibold text-ink">{title}</h2>
      <ul className="mt-2 space-y-2">
        {products.map((p) => (
          <li key={p.id} className="flex items-center gap-3 rounded-lg border border-line bg-background p-2">
            {p.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={p.image}
                alt={p.name_id}
                width={48}
                height={48}
                loading="lazy"
                className="size-12 shrink-0 rounded-lg border border-line object-cover"
              />
            ) : null}
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-ink">{p.name_id}</span>
              <span className="block truncate text-xs text-ink-muted">
                {[p.category, p.merchant].filter(Boolean).join(' · ')}
              </span>
              {p.url ? (
                <a
                  href={p.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-xs text-primary underline"
                >
                  {p.url.replace(/^https?:\/\//, '').slice(0, 48)} ↗
                </a>
              ) : null}
            </span>
            <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
              ASH-{p.friendly_code.replace('ASH-', '')}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
