# Affiliate Carousel + Shopee Linktree Scraper (27 Agu)

Recorded: 2026-08-30 21:42 (entri retroaktif untuk kerja 2026-08-27)

## Task / Problem
Menampilkan produk afiliasi secara dinamis di homepage dan membangun pipeline scrape otomatis dari Linktree Shopee Asharu, lalu mengembangkan dataset dari 50 menjadi 201 produk.

## Key Files Changed
- `src/components/cards/ProductCarousel.tsx` — carousel single-card, auto-advance 10 detik, play/pause, rAF-throttle, reduced-motion aware.
- `src/components/cards/ProductCard.tsx`, `src/app/[locale]/page.tsx` — featured 6 produk (`getFeaturedProducts(6)`, `linkPosition="home-featured"`).
- `src/data/affiliate-products.ts` — ~201 produk hasil scrape (id `affiliate-<externalId>`, bilingual, tanpa harga sesuai keputusan no-fictitious-price).
- `scripts/scrape-affiliate.mjs` + `scripts/lib/{http,image-downloader,data-writer,category-mapper}.mjs` — scrape GraphQL `collshp.com/asharu`, download + optimasi gambar (sharp, width 800), rewrite file data.
- `package.json` — script `scrape:affiliate` / `scrape:affiliate:dry-run`.

## Technical / Business Decisions
- Carousel auto-advance + kontrol eksplisit + hormat `prefers-reduced-motion`.
- Scrape 2 produk baru per run (incremental) dengan jadwal 4-hari (commit `d6df529`).
- Kategori dipetakan via `category-keywords.json`.

## Assumptions / Risks
- File data = source of truth untuk build statis (DB belum terlibat di fase ini).
- Fallback gambar ke URL remote bila download gagal — bisa ditolak skema Zod.
- GraphQL endpoint Shopee tidak resmi — bisa berubah sewaktu-waktu.

## Blockers / Unresolved
- Tidak ada (fitur selesai).

## Verification
- Gate hijau: lint ✓ typecheck ✓ test ✓ build ✓ (32 halaman saat itu).

## Commit Proposal
`feat(affiliate): home carousel + linktree scraper + 201 products`

## Related Plans
- `plans/2026-08-27-affiliate-carousel-home.md`
- `plans/2026-08-27-affiliate-carousel-progress-bar.md`
- `plans/2026-08-27-affiliate-scraper-shopee-linktree.md`
- `plans/2026-08-27-add-naraya-global-provider.md` — provider `naraya` di global `opencode.json` (di luar repo; semua task selesai, file plan belum di-commit per 30 Agu).
