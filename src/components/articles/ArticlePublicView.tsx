import { ExternalLink } from '@/components/ui/ExternalLink';

export interface ArticleViewFaq {
  q: string;
  a: string;
}

export interface ArticleViewAffiliate {
  name: string | null;
  url: string;
  image: string | null;
}

interface Props {
  title: string;
  excerpt: string;
  /** Baris tanggal terformat ("Diterbitkan ...") atau null bila disembunyikan. */
  dateLine: string | null;
  coverUrl: string | null;
  /** Markdown body (`## ` → h2, baris lain → paragraf). Tanpa HTML mentah. */
  bodyMd: string;
  affiliate: ArticleViewAffiliate | null;
  /** String UI (sudah terjemahan dari caller — server pakai `articles`, review pakai `content.review`). */
  affiliateTitle: string;
  /** Sudah interpolasi nama produk oleh caller. */
  affiliateBody: string;
  affiliateCta: string;
  affiliateNote: string;
  faqHeading: string;
  faq: ArticleViewFaq[];
  disclosureNote: string;
  disclosureLinkLabel: string | null;
  disclosureHref: string | null;
}

/** Render markdown sederhana (## → h2, baris lain → paragraf). Tanpa HTML mentah. */
export function ArticleMarkdownBody({ md }: { md: string }) {
  const blocks: { type: 'h2' | 'p'; text: string }[] = [];
  let para: string[] = [];
  const flush = () => {
    const text = para.join('\n').trim();
    if (text) blocks.push({ type: 'p', text });
    para = [];
  };
  for (const line of md.split('\n')) {
    if (line.startsWith('## ')) {
      flush();
      blocks.push({ type: 'h2', text: line.slice(3).trim() });
    } else if (line.trim() === '') {
      flush();
    } else {
      para.push(line);
    }
  }
  flush();
  return (
    <>
      {blocks.map((b, i) =>
        b.type === 'h2' ? (
          <h2 key={i} className="mt-8 text-xl font-semibold text-ink">
            {b.text}
          </h2>
        ) : (
          <p key={i} className="mt-4 leading-relaxed text-ink">
            {b.text}
          </p>
        )
      )}
    </>
  );
}

/**
 * Tampilan artikel publik bersama: dipakai halaman publik
 * (`artikel/[slug]`) dan tab Pratinjau review. Tanpa hook/i18n internal
 * agar bisa dipakai server + client; semua string dari caller.
 */
export function ArticlePublicView({
  title,
  excerpt,
  dateLine,
  coverUrl,
  bodyMd,
  affiliate,
  affiliateTitle,
  affiliateBody,
  affiliateCta,
  affiliateNote,
  faqHeading,
  faq,
  disclosureNote,
  disclosureLinkLabel,
  disclosureHref
}: Props) {
  return (
    <>
      <header className="mt-6">
        <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl lg:text-4xl">
          {title}
        </h1>
        <p className="mt-3 text-base leading-relaxed text-ink-muted">{excerpt}</p>
        {dateLine ? (
          <p className="mt-3 text-xs text-ink-muted">{dateLine}</p>
        ) : null}
      </header>

      {coverUrl ? (
        <div className="mt-6 overflow-hidden rounded-xl border border-line bg-surface">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={coverUrl}
            alt={title}
            className="aspect-video w-full object-cover"
            loading="lazy"
          />
        </div>
      ) : null}

      <div className="mt-6">
        <ArticleMarkdownBody md={bodyMd} />
      </div>

      {affiliate ? (
        <aside className="mt-8 rounded-xl border border-primary/30 bg-primary/5 p-4">
          <div className="flex items-center gap-3">
            {affiliate.image ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={affiliate.image}
                alt={affiliate.name ?? title}
                width={64}
                height={64}
                className="size-16 shrink-0 rounded-lg border border-line object-cover"
                loading="lazy"
              />
            ) : null}
            <div className="min-w-0">
              <p className="text-sm font-semibold text-ink">{affiliateTitle}</p>
              <p className="mt-1 text-sm text-ink-muted">{affiliateBody}</p>
            </div>
          </div>
          <ExternalLink
            href={affiliate.url}
            className="btn-primary mt-3 inline-flex"
          >
            {affiliateCta}
          </ExternalLink>
          <p className="mt-2 text-xs italic text-ink-muted">{affiliateNote}</p>
        </aside>
      ) : null}

      {faq.length > 0 ? (
        <section aria-labelledby="faq-heading" className="mt-10">
          <h2 id="faq-heading" className="text-xl font-semibold text-ink">
            {faqHeading}
          </h2>
          <div className="mt-4 space-y-2">
            {faq.map((item, i) => (
              <details key={i} className="rounded-xl border border-line bg-surface p-4 open:bg-background">
                <summary className="cursor-pointer list-none text-sm font-semibold text-ink marker:hidden [&::-webkit-details-marker]:hidden">
                  {item.q}
                </summary>
                <p className="mt-2 text-sm leading-relaxed text-ink-muted">{item.a}</p>
              </details>
            ))}
          </div>
        </section>
      ) : null}

      <p className="mt-10 rounded-xl border border-line bg-background p-4 text-xs leading-relaxed text-ink-muted">
        {disclosureNote}{' '}
        {disclosureLinkLabel && disclosureHref ? (
          <a href={disclosureHref} className="text-primary underline">
            {disclosureLinkLabel}
          </a>
        ) : null}
      </p>
    </>
  );
}
