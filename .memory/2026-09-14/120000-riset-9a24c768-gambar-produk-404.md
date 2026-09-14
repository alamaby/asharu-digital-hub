# Riset 9a24c768 — Gambar Produk 404 (Drift DB↔Repo): Fix Gate + Pemulihan Aset

Task: gambar produk tetap (ASH-242/243) tidak tampil di `/admin/riset/9a24c768`; RCA + fix + pemulihan 12 aset.

## RCA (tervalidasi: browser + MCP + log CI)

- Scrape 12 Sep (run `34681699238`): sukses download 12 gambar + upsert DB, tetapi **gagal gate `npm test`** → step commit tak jalan → 12 `.webp` tidak pernah masuk repo → 404 di deploy (terkonfirmasi browser: `<img>` ter-render 48×48 dengan ikon broken; URL 404).
- Akar gate gagal: `ProductCarousel.test.tsx` memakai fixture `affiliateProducts.slice(0,3)`; produk baru memiliki nama ber-spasi ganda ("Gagang  Vacuum") → normalizer testing-library meng-collapse spasi → `getByRole('heading', { name })` exact-match tidak ketemu. Run 13 Sep gagal sama (tidak self-heal).
- Run 12 Sep juga menulis file data 239 produk di runner, tapi tidak ter-commit → repo tetap 227 produk (drift lanjutan).
- 8 draf sesi membawa `affiliate_injections[0].product_image` ke path yang sama → ikut rusak di halaman review.

## Perubahan

- `src/components/cards/ProductCarousel.test.tsx` — fixture lokal 3 produk (lepas dari dataset scrape).
- `src/components/cards/ProductCard.test.tsx` — fixture lokal (lepas dari `affiliateProducts[0]`).
- `scripts/lib/data-writer.mjs` — `toAffiliateProduct`: `replace(/\s+/g, ' ')` + trim pada `linkName`.
- `src/components/admin/FixedProductCard.tsx` — `'use client'` + `onError` fallback ke `/images/products/product-placeholder-1.svg` (guard anti-loop via `dataset.fallback`); test baru di `FixedProductCard.test.tsx`.
- `.github/workflows/scrape-affiliate.yml` — step "Verify image assets exist": setiap `image:` wajib path `/images/` yang ada di disk, fail-loud sebelum commit.
- `.gitignore` — `/.openchamber` (artefak tooling browser).

## Verifikasi

- Gate lokal: typecheck ✓ lint ✓ test 556/556 ✓.
- Fase 1 pushed `db0de1b`; workflow dispatch run `34806558884` hijau semua step → commit CI `e9cd7d0` (12 `.webp` + file data 239 produk), di-pull lokal.
- DB: ASH-242/243/234 nama ternormalisasi, `image` cocok file. Kedua URL produksi 200. Capture browser halaman riset menampilkan kedua gambar.

## Catatan / Risiko

- Guard CI baru menangkap kasus "file data menunjuk aset yang tidak ada" — termasuk fallback remote URL yang lolos skema lama.
- `jsonld.test.ts` tidak diubah: assertion self-referential (kedua sisi dari dataset yang sama), tidak sensitif isi.
- Guard mass-deactivation 20% tetap melindungi re-scrape hari sepi.

Commit: `db0de1b` (fix), `e9cd7d0` (data CI). Plan: `plans/2026-09-14-riset-9a24c768-gambar-produk-404.md`.
